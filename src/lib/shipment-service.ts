import "server-only";
import { eq } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { orderLines, orders, shipments, type ShipmentStatus } from "@/db/tenant-schema";
import { applyMovement, type Actor } from "./stock";
import { emit } from "./webhooks";
import { UserError } from "@/lib/errors";

async function fulfilOrder(tx: Db, orderId: number, delivered: Array<{ itemId: number; quantity: number }>) {
  const order = await tx.query.orders.findFirst({ where: eq(orders.id, orderId), with: { lines: true } });
  if (!order) return;
  // Един артикул може да е на няколко реда: доставеното запълва редовете поред, излишъкът остава на последния.
  for (const d of delivered) {
    const forItem = order.lines.filter((l) => l.itemId === d.itemId);
    let left = d.quantity;
    for (const [i, line] of forItem.entries()) {
      const take = i === forItem.length - 1 ? left : Math.min(left, Math.max(0, line.quantity - line.fulfilledQuantity));
      if (take <= 0) continue;
      line.fulfilledQuantity += take;
      left -= take;
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

/**
 * Връщане по поръчка: не повече от доставеното минус вече върнатото (по артикул).
 * Поръчката остава със същия статус; върнатото се вижда в returnedQuantity.
 */
async function registerReturn(tx: Db, orderId: number, returned: Array<{ itemId: number; quantity: number }>) {
  const order = await tx.query.orders.findFirst({ where: eq(orders.id, orderId), with: { lines: { with: { item: true } } } });
  if (!order) return;
  const byItem = new Map<number, number>();
  for (const r of returned) byItem.set(r.itemId, (byItem.get(r.itemId) ?? 0) + r.quantity);
  for (const [itemId, qty] of byItem) {
    const forItem = order.lines.filter((l) => l.itemId === itemId);
    if (!forItem.length) throw new UserError("Връщането съдържа артикул, който не е в поръчката.");
    const fulfilled = forItem.reduce((sum, l) => sum + l.fulfilledQuantity, 0);
    const alreadyReturned = forItem.reduce((sum, l) => sum + l.returnedQuantity, 0);
    const returnable = fulfilled - alreadyReturned;
    const { item } = forItem[0];
    if (qty > returnable) throw new UserError(`„${item.name}“: може да се върнат най-много ${returnable} ${item.unit} (доставени ${fulfilled}, вече върнати ${alreadyReturned}).`);
    // разпределя върнатото по редовете на артикула
    let left = qty;
    for (const line of forItem) {
      const take = Math.min(left, line.fulfilledQuantity - line.returnedQuantity);
      if (take <= 0) continue;
      left -= take;
      await tx.update(orderLines).set({ returnedQuantity: line.returnedQuantity + take }).where(eq(orderLines.id, line.id));
    }
  }
}

/** Общо за UI и API. Доставката прилага наличността в една транзакция. */
export async function changeShipmentStatus(db: TenantDb, actor: Actor, id: number, status: ShipmentStatus) {
  const shipment = await db.query.shipments.findFirst({ where: eq(shipments.id, id), with: { lines: true } });
  if (!shipment) throw new UserError("Пратката не е намерена.");
  if (shipment.status === "delivered" || shipment.status === "cancelled") throw new UserError("Доставена или отказана пратка не може да сменя статуса си.");

  await db.transaction(async (tx) => {
    if (status === "delivered") {
      if (!shipment.locationId) throw new UserError("Пратката няма локация.");
      const type = shipment.direction === "inbound" ? "in" : "out";
      // проверката за връщане е преди движенията: при превишение нищо не се изписва
      if (shipment.isReturn && shipment.orderId) await registerReturn(tx, shipment.orderId, shipment.lines);
      for (const line of shipment.lines) {
        await applyMovement(tx, {
          actor,
          itemId: line.itemId,
          locationId: shipment.locationId,
          type,
          quantity: line.quantity,
          reason: `${shipment.isReturn ? "Връщане" : "Пратка"} ${shipment.reference}`,
          shipmentId: id,
          lot: type === "in" ? (line.lotNumber ? { lotNumber: line.lotNumber, expiryDate: line.expiryDate } : null) : line.lotId ? { lotId: line.lotId } : null,
        });
      }
      if (shipment.orderId && !shipment.isReturn) await fulfilOrder(tx, shipment.orderId, shipment.lines);
    }
    await tx.update(shipments).set({ status, deliveredAt: status === "delivered" ? new Date() : null }).where(eq(shipments.id, id));
  });
  emit(db, "shipment.status_changed", { id, reference: shipment.reference, status, isReturn: shipment.isReturn });
  return shipment;
}
