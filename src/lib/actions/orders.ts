"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ORDER_TYPES, orderLines, orders, shipmentLines, shipments, type OrderStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { oneOf, optional, optionalInt, str } from "@/lib/forms";
import { getDefaultLocation, nextOrderNumber } from "@/lib/queries";
import { emit } from "@/lib/webhooks";

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

async function own(orgId: number, id: number) {
  const o = await db.query.orders.findFirst({ where: and(eq(orders.id, id), eq(orders.organizationId, orgId)), with: { lines: { with: { item: true } }, partner: true } });
  if (!o) throw new Error("Поръчката не е намерена.");
  return o;
}

export async function createOrder(fd: FormData) {
  const ctx = await requireContext("write");
  const type = oneOf(fd, "type", ORDER_TYPES, "purchase");
  const lines = readLines(fd);
  if (!lines.length) throw new Error("Добавете поне един ред към поръчката.");
  const number = str(fd, "number") || (await nextOrderNumber(ctx.org.id, type));
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(orders)
      .values({
        organizationId: ctx.org.id,
        type,
        number,
        partnerId: optionalInt(fd, "partnerId"),
        locationId: optionalInt(fd, "locationId") ?? (await getDefaultLocation(ctx.org.id))?.id ?? null,
        status: str(fd, "confirm") === "1" ? "confirmed" : "draft",
        orderDate: optional(fd, "orderDate") ?? new Date().toISOString().slice(0, 10),
        expectedDate: optional(fd, "expectedDate"),
        notes: optional(fd, "notes"),
        createdBy: ctx.user.id,
      })
      .returning({ id: orders.id });
    await tx.insert(orderLines).values(lines.map((l) => ({ ...l, orderId: row.id })));
    return row.id;
  });
  await audit(ctx, "create", "order", id, { number, type });
  emit(ctx.org.id, "order.created", { id, number, type, lines });
  revalidate(id);
  redirect(`/orders/${id}`);
}

export async function updateOrder(id: number, fd: FormData) {
  const ctx = await requireContext("write");
  const existing = await own(ctx.org.id, id);
  if (existing.status !== "draft") throw new Error("Само чернови могат да се редактират. Създайте пратка за промени в изпълнението.");
  const lines = readLines(fd);
  if (!lines.length) throw new Error("Добавете поне един ред към поръчката.");
  await db.transaction(async (tx) => {
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
  redirect(`/orders/${id}`);
}

export async function setOrderStatus(id: number, status: OrderStatus) {
  const ctx = await requireContext("write");
  const o = await own(ctx.org.id, id);
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    draft: ["confirmed", "cancelled"],
    confirmed: ["cancelled"],
    partial: ["cancelled", "completed"],
    completed: [],
    cancelled: [],
  };
  if (!allowed[o.status].includes(status)) throw new Error(`Преход от „${o.status}“ към „${status}“ не е позволен.`);
  await db.update(orders).set({ status }).where(eq(orders.id, id));
  await audit(ctx, "status", "order", id, { number: o.number, status });
  emit(ctx.org.id, "order.status_changed", { id, number: o.number, status });
  revalidate(id);
}

/** Creates a pending shipment for everything not yet fulfilled on the order. */
export async function createShipmentForRemaining(id: number) {
  const ctx = await requireContext("write");
  const o = await own(ctx.org.id, id);
  if (o.status !== "confirmed" && o.status !== "partial") throw new Error("Потвърдете поръчката, преди да създадете пратка.");
  // Subtract quantities already on open shipments for this order.
  const openShipments = await db.query.shipments.findMany({
    where: and(eq(shipments.orderId, id), eq(shipments.organizationId, ctx.org.id)),
    with: { lines: true },
  });
  const reserved = new Map<number, number>();
  for (const s of openShipments) {
    if (s.status === "pending" || s.status === "in_transit") for (const l of s.lines) reserved.set(l.itemId, (reserved.get(l.itemId) ?? 0) + l.quantity);
  }
  const remaining = o.lines
    .map((l) => ({ itemId: l.itemId, quantity: l.quantity - l.fulfilledQuantity - (reserved.get(l.itemId) ?? 0) }))
    .filter((l) => l.quantity > 0);
  if (!remaining.length) throw new Error("Няма оставащи количества: всичко е доставено или вече е в пратка.");

  const count = openShipments.length + 1;
  const shipmentId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(shipments)
      .values({
        organizationId: ctx.org.id,
        reference: `${o.number}/${count}`,
        direction: o.type === "purchase" ? "inbound" : "outbound",
        locationId: o.locationId,
        orderId: o.id,
        partnerId: o.partnerId,
        partner: o.partner?.name ?? null,
        expectedDate: o.expectedDate,
        createdBy: ctx.user.id,
      })
      .returning({ id: shipments.id });
    await tx.insert(shipmentLines).values(remaining.map((l) => ({ ...l, shipmentId: row.id })));
    return row.id;
  });
  await audit(ctx, "create", "shipment", shipmentId, { fromOrder: o.number });
  emit(ctx.org.id, "shipment.created", { id: shipmentId, orderId: o.id, lines: remaining });
  revalidate(id);
  revalidatePath("/shipments");
  redirect(`/shipments/${shipmentId}/edit`);
}

export async function deleteOrder(id: number) {
  const ctx = await requireContext("delete");
  const o = await own(ctx.org.id, id);
  await db.delete(orders).where(eq(orders.id, id));
  await audit(ctx, "delete", "order", id, { number: o.number });
  revalidate();
  redirect("/orders");
}
