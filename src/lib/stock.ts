import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { items, lots, stockLevels, stockMovements, type MovementType } from "@/db/schema";
import { emit } from "./webhooks";

export type LotInput =
  /** Outbound / transfer-out from an existing lot. */
  | { lotId: number }
  /** Inbound: create or top up a lot. For serial items `lotNumber` holds one serial per line/comma. */
  | { lotNumber: string; expiryDate?: string | null; serialNumber?: string | null }
  | null
  | undefined;

export type MovementInput = {
  orgId: number;
  userId: number | null;
  itemId: number;
  locationId: number;
  type: MovementType;
  /** Positive quantity. For `adjust` it is the new absolute quantity at the location. */
  quantity: number;
  reason?: string | null;
  shipmentId?: number | null;
  lot?: LotInput;
};

/**
 * Applies one stock movement: updates the per-location level, the lot (if tracked),
 * the cached item total, and writes the movement row. Call inside a transaction.
 */
export async function applyMovement(tx: DbOrTx, input: MovementInput) {
  const item = await tx.query.items.findFirst({ where: and(eq(items.id, input.itemId), eq(items.organizationId, input.orgId)) });
  if (!item) throw new Error("Артикулът не е намерен.");
  if (input.quantity < 0 || !Number.isInteger(input.quantity)) throw new Error("Въведете валидно количество.");

  const [level] = await tx
    .select()
    .from(stockLevels)
    .where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.locationId, input.locationId)));
  const before = level?.quantity ?? 0;

  let delta: number;
  if (input.type === "in" || input.type === "transfer_in") delta = input.quantity;
  else if (input.type === "out" || input.type === "transfer_out") delta = -input.quantity;
  else delta = input.quantity - before;

  if (delta === 0) return { delta: 0, after: item.quantity };
  const after = before + delta;
  if (after < 0) throw new Error(`Недостатъчна наличност в локацията (има ${before} ${item.unit}).`);

  // ---- lots / serial numbers
  let lotId: number | null = null;
  if (item.tracking !== "none") {
    if (input.type === "adjust") throw new Error("За артикули с партиди/серийни номера използвайте приход или разход с партида.");
    if (delta < 0) {
      if (!input.lot || !("lotId" in input.lot)) throw new Error(`Изберете партида за „${item.name}“.`);
      const lot = await tx.query.lots.findFirst({ where: and(eq(lots.id, input.lot.lotId), eq(lots.itemId, item.id)) });
      if (!lot || lot.locationId !== input.locationId) throw new Error("Партидата не е в тази локация.");
      if (lot.quantity < input.quantity) throw new Error(`В партида ${lot.lotNumber} има само ${lot.quantity} ${item.unit}.`);
      await tx.update(lots).set({ quantity: lot.quantity - input.quantity }).where(eq(lots.id, lot.id));
      lotId = lot.id;
    } else {
      if (!input.lot || !("lotNumber" in input.lot) || !input.lot.lotNumber) throw new Error(`Въведете партида/сериен номер за „${item.name}“.`);
      if (item.tracking === "serial") {
        const serials = input.lot.lotNumber.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
        if (serials.length !== input.quantity) throw new Error(`Броят серийни номера (${serials.length}) трябва да е равен на количеството (${input.quantity}).`);
        for (const serial of serials) {
          const dup = await tx.query.lots.findFirst({ where: and(eq(lots.itemId, item.id), eq(lots.serialNumber, serial)) });
          if (dup && dup.quantity > 0) throw new Error(`Сериен номер ${serial} вече е в наличност.`);
          if (dup) await tx.update(lots).set({ quantity: 1, locationId: input.locationId }).where(eq(lots.id, dup.id));
          else
            await tx.insert(lots).values({
              organizationId: input.orgId,
              itemId: item.id,
              locationId: input.locationId,
              lotNumber: serial,
              serialNumber: serial,
              expiryDate: input.lot.expiryDate ?? null,
              quantity: 1,
            });
        }
      } else {
        const existing = await tx.query.lots.findFirst({
          where: and(eq(lots.itemId, item.id), eq(lots.locationId, input.locationId), eq(lots.lotNumber, input.lot.lotNumber)),
        });
        if (existing) {
          await tx
            .update(lots)
            .set({ quantity: existing.quantity + input.quantity, expiryDate: input.lot.expiryDate ?? existing.expiryDate })
            .where(eq(lots.id, existing.id));
          lotId = existing.id;
        } else {
          const [created] = await tx
            .insert(lots)
            .values({
              organizationId: input.orgId,
              itemId: item.id,
              locationId: input.locationId,
              lotNumber: input.lot.lotNumber,
              expiryDate: input.lot.expiryDate ?? null,
              quantity: input.quantity,
            })
            .returning({ id: lots.id });
          lotId = created.id;
        }
      }
    }
  }

  // ---- levels + cached total
  if (level) await tx.update(stockLevels).set({ quantity: after }).where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.locationId, input.locationId)));
  else await tx.insert(stockLevels).values({ itemId: item.id, locationId: input.locationId, quantity: after });

  const totalAfter = item.quantity + delta;
  await tx.update(items).set({ quantity: totalAfter, updatedAt: new Date() }).where(eq(items.id, item.id));

  await tx.insert(stockMovements).values({
    organizationId: input.orgId,
    itemId: item.id,
    locationId: input.locationId,
    lotId,
    userId: input.userId,
    type: input.type,
    delta,
    quantityAfter: totalAfter,
    reason: input.reason ?? null,
    shipmentId: input.shipmentId ?? null,
  });

  emit(input.orgId, "movement.created", { itemId: item.id, sku: item.sku, locationId: input.locationId, type: input.type, delta, quantityAfter: totalAfter });
  if (item.minQuantity > 0 && totalAfter <= item.minQuantity && item.quantity > item.minQuantity) {
    emit(input.orgId, "item.low_stock", { itemId: item.id, sku: item.sku, name: item.name, quantity: totalAfter, minQuantity: item.minQuantity });
  }
  return { delta, after: totalAfter };
}

/** Moves stock between two locations as a pair of transfer movements. */
export async function transferStock(input: {
  orgId: number;
  userId: number | null;
  itemId: number;
  fromLocationId: number;
  toLocationId: number;
  quantity: number;
  lotId?: number | null;
  reason?: string | null;
}) {
  if (input.fromLocationId === input.toLocationId) throw new Error("Изберете две различни локации.");
  await db.transaction(async (tx) => {
    let lotForIn: LotInput = null;
    if (input.lotId) {
      const lot = await tx.query.lots.findFirst({ where: eq(lots.id, input.lotId) });
      if (!lot) throw new Error("Партидата не е намерена.");
      lotForIn = { lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, serialNumber: lot.serialNumber };
    }
    const reason = input.reason ?? "Трансфер между локации";
    await applyMovement(tx, { ...input, locationId: input.fromLocationId, type: "transfer_out", reason, lot: input.lotId ? { lotId: input.lotId } : null });
    await applyMovement(tx, { ...input, locationId: input.toLocationId, type: "transfer_in", reason, lot: lotForIn });
  });
}
