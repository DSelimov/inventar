import "server-only";
/*
 * Приемане на входяща пратка със скенер: очакваните редове идват от пратката, сканираното е полученото.
 * „Приеми“ заменя редовете с преброеното (партида, срок, доставна цена от оригиналния ред) и прилага
 * доставката през changeShipmentStatus — същата себестойност, партиди и изпълнение на поръчката като ръчно.
 */
import { asc, eq, inArray } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { itemUnits, items, shipmentLines, shipments } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { assertQuantity, itemDecimals, subQty } from "./quantity";
import { changeShipmentStatus } from "./shipment-service";
import { assertLocationAccess, type Actor } from "./stock";

export type ReceivedRow = { itemId: number; quantity: number; lotNumber?: string | null; expiryDate?: string | null; sourceLineId?: number | null };

/** Данни за екрана за приемане: пратката, очакваните редове и кодовете за разпознаване. */
export async function receivingData(db: Db, shipmentId: number) {
  const shipment = await db.query.shipments.findFirst({ where: eq(shipments.id, shipmentId), with: { location: true, partnerRecord: true, order: true } });
  if (!shipment) return null;
  const lines = await db
    .select({
      id: shipmentLines.id,
      itemId: shipmentLines.itemId,
      quantity: shipmentLines.quantity,
      lotNumber: shipmentLines.lotNumber,
      expiryDate: shipmentLines.expiryDate,
      unitCost: shipmentLines.unitCost,
    })
    .from(shipmentLines)
    .where(eq(shipmentLines.shipmentId, shipmentId))
    .orderBy(asc(shipmentLines.id));
  const [catalog, units] = await Promise.all([
    db
      .select({ id: items.id, sku: items.sku, barcode: items.barcode, name: items.name, variant: items.variantLabel, unit: items.unit, tracking: items.tracking, quantityDecimals: items.quantityDecimals })
      .from(items)
      .where(eq(items.status, "active"))
      .orderBy(asc(items.name)),
    db.select({ itemId: itemUnits.itemId, name: itemUnits.name, factor: itemUnits.factor, barcode: itemUnits.barcode }).from(itemUnits),
  ]);
  return { shipment, lines, items: catalog, units };
}

export async function receiveShipment(db: TenantDb, actor: Actor, shipmentId: number, rows: ReceivedRow[]) {
  const shipment = await db.query.shipments.findFirst({ where: eq(shipments.id, shipmentId) });
  if (!shipment) throw new UserError("Пратката не е намерена.");
  if (shipment.direction !== "inbound") throw new UserError("Приемането със скенер е за входящи пратки.");
  if (shipment.status === "delivered" || shipment.status === "cancelled") throw new UserError("Пратката вече е доставена или отказана.");
  assertLocationAccess(actor, shipment.locationId);

  const received = rows.filter((r) => r.itemId > 0 && r.quantity > 0);
  if (!received.length) throw new UserError("Нищо не е преброено — сканирайте получената стока.");
  const old = await db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, shipmentId)).orderBy(asc(shipmentLines.id));
  const catalog = await db.select().from(items).where(inArray(items.id, [...new Set([...received.map((r) => r.itemId), ...old.map((l) => l.itemId)])]));
  const byId = new Map(catalog.map((i) => [i.id, i]));
  for (const r of received) {
    const item = byId.get(r.itemId);
    if (!item) throw new UserError("Артикулът не е намерен.");
    assertQuantity(r.quantity, itemDecimals(item), `„${item.name}“`);
    if (item.tracking !== "none" && !r.lotNumber?.trim()) throw new UserError(`„${item.name}“: въведете ${item.tracking === "serial" ? "серийните номера" : "партидата"}.`);
    if (item.tracking === "serial") {
      const n = r.lotNumber!.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean).length;
      if (n !== r.quantity) throw new UserError(`„${item.name}“: серийните номера (${n}) трябва да са колкото количеството (${r.quantity}).`);
    }
  }

  const costFor = (r: ReceivedRow) => old.find((l) => l.id === r.sourceLineId)?.unitCost ?? old.find((l) => l.itemId === r.itemId)?.unitCost ?? null;

  // разлики спрямо очакваното — записват се в бележката на пратката
  const expected = new Map<number, number>();
  for (const l of old) expected.set(l.itemId, (expected.get(l.itemId) ?? 0) + l.quantity);
  const got = new Map<number, number>();
  for (const r of received) got.set(r.itemId, (got.get(r.itemId) ?? 0) + r.quantity);
  const diffs: string[] = [];
  for (const id of new Set([...expected.keys(), ...got.keys()])) {
    const d = subQty(got.get(id) ?? 0, expected.get(id) ?? 0);
    if (d === 0) continue;
    const item = byId.get(id);
    diffs.push(`${item?.name ?? `#${id}`}: ${d > 0 ? "+" : ""}${d}${item ? ` ${item.unit}` : ""}`);
  }

  await db.transaction(async (tx) => {
    await tx.delete(shipmentLines).where(eq(shipmentLines.shipmentId, shipmentId));
    await tx.insert(shipmentLines).values(
      received.map((r) => ({ shipmentId, itemId: r.itemId, quantity: r.quantity, lotNumber: r.lotNumber?.trim() || null, expiryDate: r.expiryDate || null, unitCost: costFor(r) })),
    );
    if (diffs.length) {
      const note = `Приемане със скенер — разлики спрямо очакваното: ${diffs.join("; ")}`;
      await tx
        .update(shipments)
        .set({ notes: shipment.notes ? `${shipment.notes}\n${note}` : note })
        .where(eq(shipments.id, shipmentId));
    }
  });

  try {
    await changeShipmentStatus(db, actor, shipmentId, "delivered");
  } catch (e) {
    // доставката не мина (напр. невалидна партида) — връщаме първоначалните редове и бележка
    await db.transaction(async (tx) => {
      await tx.delete(shipmentLines).where(eq(shipmentLines.shipmentId, shipmentId));
      if (old.length) await tx.insert(shipmentLines).values(old.map((l) => ({ shipmentId, itemId: l.itemId, quantity: l.quantity, lotNumber: l.lotNumber, expiryDate: l.expiryDate, lotId: l.lotId, unitCost: l.unitCost })));
      await tx.update(shipments).set({ notes: shipment.notes }).where(eq(shipments.id, shipmentId));
    });
    throw e;
  }
  return { reference: shipment.reference, lines: received.length, diffs };
}
