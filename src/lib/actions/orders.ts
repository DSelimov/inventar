"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { Db } from "@/db/tenant";
import { ORDER_TYPES, orderLines, orders, shipmentLines, shipments, type OrderStatus } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { oneOf, optional, optionalInt, str } from "@/lib/forms";
import { getDefaultLocation, nextOrderNumber } from "@/lib/queries";
import { emit } from "@/lib/webhooks";
import { act, redirectWith } from "@/lib/action";
import { UserError } from "@/lib/errors";

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
  const merged = new Map<number, { quantity: number; unitPrice: number }>();
  ids.forEach((id, i) => {
    const itemId = Number(id);
    const quantity = Math.trunc(Number(qtys[i] ?? 0));
    const unitPrice = Number(String(prices[i] ?? "0").replace(",", ".")) || 0;
    if (Number.isInteger(itemId) && itemId > 0 && quantity > 0) {
      const prev = merged.get(itemId);
      merged.set(itemId, { quantity: (prev?.quantity ?? 0) + quantity, unitPrice });
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
  const lines = readLines(fd);
  if (!lines.length) throw new UserError("Добавете поне един ред към поръчката.");
  const number = str(fd, "number") || (await nextOrderNumber(ctx.db, type));
  const locationId = optionalInt(fd, "locationId") ?? (await getDefaultLocation(ctx.db))?.id ?? null;
  const id = await ctx.db.transaction(async (tx) => {
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
        createdBy: ctx.user.id,
      })
      .$returningId();
    await tx.insert(orderLines).values(lines.map((l) => ({ ...l, orderId: row.id })));
    return row.id;
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
  const lines = readLines(fd);
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
  for (const s of openShipments) if (s.status === "pending" || s.status === "in_transit") for (const l of s.lines) reserved.set(l.itemId, (reserved.get(l.itemId) ?? 0) + l.quantity);
  const remaining = o.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity - l.fulfilledQuantity - (reserved.get(l.itemId) ?? 0) })).filter((l) => l.quantity > 0);
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
