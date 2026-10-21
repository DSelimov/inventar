"use server";

import { and, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { Db } from "@/db/tenant";
import { lots, ORDER_TYPES, orderLines, orders, shipmentLines, shipments, type OrderStatus } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { oneOf, optional, optionalInt, str } from "@/lib/forms";
import { nextNumber } from "@/lib/numbering";
import { getDefaultLocation } from "@/lib/queries";
import { emit } from "@/lib/webhooks";
import { act, redirectWith } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";
import { MAX_DECIMALS, addQty, parseQuantity, subQty } from "@/lib/quantity";
import { assertItemQuantities } from "@/lib/stock";
import { getSettings } from "@/lib/settings";
import { assignVat } from "@/lib/vat-rates";

function revalidate(id?: number) {
  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath("/reports");
  if (id) revalidatePath(`/orders/${id}`);
}

function readLines(fd: FormData) {
  const ids = fd.getAll("lineItemId").map(String);
  const qtys = fd.getAll("lineQuantity").map(String);
  const prices = fd.getAll("linePrice").map(String);
  const vats = fd.getAll("lineVatRateId").map(String);
  const merged = new Map<number, { quantity: number; unitPrice: number; vatRateId: number | null }>();
  ids.forEach((id, i) => {
    const itemId = Number(id);
    const quantity = parseQuantity(qtys[i], MAX_DECIMALS, `Ред ${i + 1}: количество`);
    const unitPrice = parseMoney(prices[i], `Ред ${i + 1}: цена`);
    if (Number.isInteger(itemId) && itemId > 0 && quantity > 0) {
      const prev = merged.get(itemId);
      merged.set(itemId, { quantity: addQty(prev?.quantity ?? 0, quantity), unitPrice, vatRateId: Number(vats[i]) > 0 ? Number(vats[i]) : null });
    }
  });
  return [...merged].map(([itemId, v]) => ({ itemId, ...v }));
}

async function own(db: Db, id: number) {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, id), with: { lines: { with: { item: true } }, partner: true } });
  if (!o) throw new UserError("Поръчката не е намерена.");
  return o;
}

export const createOrder = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const type = oneOf(fd, "type", ORDER_TYPES, "purchase");
  const lines = await assignVat(ctx.db, readLines(fd));
  await assertItemQuantities(ctx.db, lines);
  if (!lines.length) throw new UserError("Добавете поне един ред към поръчката.");
  const locationId = optionalInt(fd, "locationId") ?? (await getDefaultLocation(ctx.db))?.id ?? null;
  const { id, number } = await ctx.db.transaction(async (tx) => {
    // ръчно въведен номер или следващият поред (заема се в транзакцията — без дупки)
    const number = str(fd, "number") || (await nextNumber(tx, type));
    const [row] = await tx
      .insert(orders)
      .values({
        type,
        number,
        partnerId: optionalInt(fd, "partnerId"),
        locationId,
        status: str(fd, "confirm") === "1" ? "confirmed" : "draft",
        orderDate: optional(fd, "orderDate") ?? new Date().toISOString().slice(0, 10),
        expectedDate: optional(fd, "expectedDate"),
        notes: optional(fd, "notes"),
        pricesIncludeVat: (await getSettings(ctx.db)).pricesIncludeVat,
        createdBy: ctx.user.id,
      })
      .$returningId();
    await tx.insert(orderLines).values(lines.map((l) => ({ ...l, orderId: row.id })));
    return { id: row.id, number };
  });
  await audit(ctx, "create", "order", id, { number, type });
  emit(ctx.db, "order.created", { id, number, type, lines });
  revalidate(id);
  return redirectWith(`/orders/${id}`, "Поръчката е създадена.");
});

export const updateOrder = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const existing = await own(ctx.db, id);
  if (existing.status !== "draft") throw new UserError("Само чернови могат да се редактират. Създайте пратка за промени в изпълнението.");
  const lines = await assignVat(ctx.db, readLines(fd));
  await assertItemQuantities(ctx.db, lines);
  if (!lines.length) throw new UserError("Добавете поне един ред към поръчката.");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        number: str(fd, "number") || existing.number,
        partnerId: optionalInt(fd, "partnerId"),
        locationId: optionalInt(fd, "locationId"),
        orderDate: optional(fd, "orderDate"),
        expectedDate: optional(fd, "expectedDate"),
        notes: optional(fd, "notes"),
      })
      .where(eq(orders.id, id));
    await tx.delete(orderLines).where(eq(orderLines.orderId, id));
    await tx.insert(orderLines).values(lines.map((l) => ({ ...l, orderId: id })));
  });
  await audit(ctx, "update", "order", id, { number: existing.number });
  revalidate(id);
  return redirectWith(`/orders/${id}`, "Поръчката е запазена.");
});

export const setOrderStatus = act(async (id: number, status: OrderStatus) => {
  const ctx = await requireContext("write");
  const o = await own(ctx.db, id);
  const allowed: Record<OrderStatus, OrderStatus[]> = { draft: ["confirmed", "cancelled"], confirmed: ["cancelled"], partial: ["cancelled", "completed"], completed: [], cancelled: [] };
  if (!allowed[o.status].includes(status)) throw new UserError(`Преход от „${o.status}“ към „${status}“ не е позволен.`);
  await ctx.db.update(orders).set({ status }).where(eq(orders.id, id));
  await audit(ctx, "status", "order", id, { number: o.number, status });
  emit(ctx.db, "order.status_changed", { id, number: o.number, status });
  revalidate(id);
  return "Статусът на поръчката е сменен.";
});

export const createShipmentForRemaining = act(async (id: number) => {
  const ctx = await requireContext("write");
  const o = await own(ctx.db, id);
  if (o.status !== "confirmed" && o.status !== "partial") throw new UserError("Потвърдете поръчката, преди да създадете пратка.");
  const openShipments = await ctx.db.query.shipments.findMany({ where: eq(shipments.orderId, id), with: { lines: true } });
  const reserved = new Map<number, number>();
  for (const s of openShipments) if (!s.isReturn && (s.status === "pending" || s.status === "in_transit")) for (const l of s.lines) reserved.set(l.itemId, addQty(reserved.get(l.itemId) ?? 0, l.quantity));
  const remaining = o.lines.map((l) => ({ itemId: l.itemId, quantity: subQty(subQty(l.quantity, l.fulfilledQuantity), reserved.get(l.itemId) ?? 0) })).filter((l) => l.quantity > 0);
  if (!remaining.length) throw new UserError("Няма оставащи количества: всичко е доставено или вече е в пратка.");

  const count = openShipments.length + 1;
  const shipmentId = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(shipments)
      .values({
        reference: `${o.number}/${count}`,
        direction: o.type === "purchase" ? "inbound" : "outbound",
        locationId: o.locationId,
        orderId: o.id,
        partnerId: o.partnerId,
        partner: o.partner?.name ?? null,
        expectedDate: o.expectedDate,
        createdBy: ctx.user.id,
      })
      .$returningId();
    await tx.insert(shipmentLines).values(remaining.map((l) => ({ ...l, shipmentId: row.id })));
    return row.id;
  });
  await audit(ctx, "create", "shipment", shipmentId, { fromOrder: o.number });
  emit(ctx.db, "shipment.created", { id: shipmentId, orderId: o.id, lines: remaining });
  revalidate(id);
  revalidatePath("/shipments");
  return redirectWith(`/shipments/${shipmentId}/edit`, "Пратката за остатъка е създадена.");
});

export const deleteOrder = act(async (id: number) => {
  const ctx = await requireContext("delete");
  const o = await own(ctx.db, id);
  await ctx.db.delete(orders).where(eq(orders.id, id));
  await audit(ctx, "delete", "order", id, { number: o.number });
  revalidate();
  return redirectWith("/orders", "Поръчката е изтрита.");
});

/**
 * Връщане по изпълнена поръчка: от клиента (продажба → входяща пратка) или към доставчика
 * (доставка → изходяща). Предлага доставеното минус върнатото и минус отворените връщания;
 * количествата и партидите се уточняват в редакцията на пратката.
 */
export const createReturnForOrder = act(async (id: number) => {
  const ctx = await requireContext("write");
  const o = await own(ctx.db, id);
  const related = await ctx.db.query.shipments.findMany({ where: eq(shipments.orderId, id), with: { lines: { with: { lot: true } } } });
  const pendingReturns = new Map<number, number>();
  for (const s of related) if (s.isReturn && (s.status === "pending" || s.status === "in_transit")) for (const l of s.lines) pendingReturns.set(l.itemId, addQty(pendingReturns.get(l.itemId) ?? 0, l.quantity));
  // отворените връщания се приспадат по редовете на артикула поред, а не от всеки ред поотделно
  const lines = o.lines
    .map((l) => {
      const open = subQty(l.fulfilledQuantity, l.returnedQuantity);
      const pending = Math.min(open, pendingReturns.get(l.itemId) ?? 0);
      pendingReturns.set(l.itemId, subQty(pendingReturns.get(l.itemId) ?? 0, pending));
      return { line: l, quantity: subQty(open, pending) };
    })
    .filter((x) => x.quantity > 0);
  if (!lines.length) throw new UserError("Няма количества за връщане: нищо не е доставено или всичко вече е върнато.");

  // партида от оригиналната доставка, ако е една-единствена
  const delivered = related.filter((s) => !s.isReturn && s.status === "delivered");
  const lotFor = (itemId: number) => {
    const used = [...new Set(delivered.flatMap((s) => s.lines.filter((l) => l.itemId === itemId).map((l) => l.lot?.lotNumber ?? l.lotNumber).filter(Boolean)))] as string[];
    return used.length === 1 ? used[0] : null;
  };
  const supplierReturn = o.type === "purchase";
  const locationId = o.locationId ?? (await getDefaultLocation(ctx.db))?.id ?? null;
  const values = await Promise.all(
    lines.map(async ({ line, quantity }) => {
      const lotNumber = line.item.tracking !== "none" ? lotFor(line.itemId) : null;
      let lotId: number | null = null;
      if (supplierReturn && lotNumber && locationId) {
        const lot = await ctx.db.query.lots.findFirst({ where: and(eq(lots.itemId, line.itemId), eq(lots.locationId, locationId), eq(lots.lotNumber, lotNumber), gt(lots.quantity, 0)) });
        lotId = lot?.id ?? null;
      }
      return { itemId: line.itemId, quantity, lotNumber: supplierReturn ? null : lotNumber, lotId };
    }),
  );

  const n = related.filter((s) => s.isReturn).length + 1;
  const shipmentId = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(shipments)
      .values({
        reference: `${o.number}/В${n}`,
        direction: supplierReturn ? "outbound" : "inbound",
        isReturn: true,
        locationId,
        orderId: o.id,
        partnerId: o.partnerId,
        partner: o.partner?.name ?? null,
        createdBy: ctx.user.id,
      })
      .$returningId();
    await tx.insert(shipmentLines).values(values.map((v) => ({ ...v, shipmentId: row.id })));
    return row.id;
  });
  await audit(ctx, "create", "shipment", shipmentId, { returnForOrder: o.number });
  emit(ctx.db, "shipment.created", { id: shipmentId, orderId: o.id, isReturn: true, lines: values });
  revalidate(id);
  revalidatePath("/shipments");
  return redirectWith(`/shipments/${shipmentId}/edit`, supplierReturn ? "Връщането към доставчика е създадено — уточнете количествата." : "Връщането от клиента е създадено — уточнете количествата.");
});
