import "server-only";
import { eq } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { orderLines, orders, shipments, type ShipmentStatus } from "@/db/tenant-schema";
import { applyMovement, type Actor } from "./stock";
import { emit } from "./webhooks";

async function fulfilOrder(tx: Db, orderId: number, delivered: Array<{ itemId: number; quantity: number }>) {
  const order = await tx.query.orders.findFirst({ where: eq(orders.id, orderId), with: { lines: true } });
  if (!order) return;
  for (const d of delivered) {
    const line = order.lines.find((l) => l.itemId === d.itemId);
    if (line) {
      line.fulfilledQuantity += d.quantity;
      await tx.update(orderLines).set({ fulfilledQuantity: line.fulfilledQuantity }).where(eq(orderLines.id, line.id));
    }
  }
  const complete = order.lines.every((l) => l.fulfilledQuantity >= l.quantity);
  const any = order.lines.some((l) => l.fulfilledQuantity > 0);
  const status = complete ? "completed" : any ? "partial" : order.status;
  if (status !== order.status) {
    await tx.update(orders).set({ status }).where(eq(orders.id, orderId));
    emit(tx, "order.status_changed", { id: orderId, number: order.number, status });
  }
}

/** Общо за UI и API. Доставката прилага наличността в една транзакция. */
export async function changeShipmentStatus(db: TenantDb, actor: Actor, id: number, status: ShipmentStatus) {
  const shipment = await db.query.shipments.findFirst({ where: eq(shipments.id, id), with: { lines: true } });
  if (!shipment) throw new Error("Пратката не е намерена.");
  if (shipment.status === "delivered" || shipment.status === "cancelled") throw new Error("Доставена или отказана пратка не може да сменя статуса си.");

  await db.transaction(async (tx) => {
    if (status === "delivered") {
      if (!shipment.locationId) throw new Error("Пратката няма локация.");
      const type = shipment.direction === "inbound" ? "in" : "out";
      for (const line of shipment.lines) {
        await applyMovement(tx, {
          actor,
          itemId: line.itemId,
          locationId: shipment.locationId,
          type,
          quantity: line.quantity,
          reason: `Пратка ${shipment.reference}`,
          shipmentId: id,
          lot: type === "in" ? (line.lotNumber ? { lotNumber: line.lotNumber, expiryDate: line.expiryDate } : null) : line.lotId ? { lotId: line.lotId } : null,
        });
      }
      if (shipment.orderId) await fulfilOrder(tx, shipment.orderId, shipment.lines);
    }
    await tx.update(shipments).set({ status, deliveredAt: status === "delivered" ? new Date() : null }).where(eq(shipments.id, id));
  });
  emit(db, "shipment.status_changed", { id, reference: shipment.reference, status });
  return shipment;
}
