import "server-only";
import { and, count, eq, inArray, or, sql, type AnyColumn } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { items, lots, orderLines, stockLevels, stockMovements, type MovementType } from "@/db/tenant-schema";
import { emit } from "./webhooks";
import { UserError } from "@/lib/errors";
import { addQty, assertQuantity, itemDecimals, subQty } from "./quantity";
import { costMovement, recordLayer } from "./valuation";

export type LotInput = { lotId: number } | { lotNumber: string; expiryDate?: string | null; serialNumber?: string | null } | null | undefined;
export type Actor = { id: number; name: string } | null;

export type MovementInput = {
  actor: Actor;
  itemId: number;
  locationId: number;
  type: MovementType;
  /** Положително количество; за adjust — новото абсолютно количество в локацията. */
  quantity: number;
  reason?: string | null;
  shipmentId?: number | null;
  lot?: LotInput;
  /** Цена за единица при приход (доставка) или връщане по оригиналната цена; иначе — по метода на оценка. */
  unitCost?: number | null;
  /** Поръчката на движението (fifo слоеве; връщане към доставчик изписва първо от нейните слоеве). */
  orderId?: number | null;
};

/**
 * Прилага едно складово движение: ниво по локация, партида (ако има), кеширана обща
 * наличност и ред в историята. Извиква се в транзакция.
 */
export async function applyMovement(tx: Db, input: MovementInput) {
  // редът на артикула се заключва: паралелни движения не губят обща наличност или средна цена
  const [item] = await tx.select().from(items).where(eq(items.id, input.itemId)).for("update");
  if (!item) throw new UserError("Артикулът не е намерен.");
  // цели бройки или до quantity_decimals знака (кг, л…); серийните номера — винаги цели
  assertQuantity(input.quantity, itemDecimals(item), `„${item.name}“`);

  const [level] = await tx.select().from(stockLevels).where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.locationId, input.locationId)));
  const before = level?.quantity ?? 0;

  let delta: number;
  if (input.type === "in" || input.type === "transfer_in") delta = input.quantity;
  else if (input.type === "out" || input.type === "transfer_out") delta = -input.quantity;
  else delta = subQty(input.quantity, before);

  if (delta === 0) return { delta: 0, after: item.quantity };
  const after = addQty(before, delta);
  if (after < 0) throw new UserError(`Недостатъчна наличност в локацията (има ${before} ${item.unit}).`);

  let lotId: number | null = null;
  if (item.tracking !== "none") {
    if (input.type === "adjust") throw new UserError("За артикули с партиди/серийни номера използвайте приход или разход с партида.");
    if (delta < 0) {
      if (!input.lot || !("lotId" in input.lot)) throw new UserError(`Изберете партида за „${item.name}“.`);
      const lot = await tx.query.lots.findFirst({ where: and(eq(lots.id, input.lot.lotId), eq(lots.itemId, item.id)) });
      if (!lot || lot.locationId !== input.locationId) throw new UserError("Партидата не е в тази локация.");
      if (lot.quantity < input.quantity) throw new UserError(`В партида ${lot.lotNumber} има само ${lot.quantity} ${item.unit}.`);
      await tx.update(lots).set({ quantity: subQty(lot.quantity, input.quantity) }).where(eq(lots.id, lot.id));
      lotId = lot.id;
    } else {
      if (!input.lot || !("lotNumber" in input.lot) || !input.lot.lotNumber) throw new UserError(`Въведете партида/сериен номер за „${item.name}“.`);
      if (item.tracking === "serial") {
        const serials = input.lot.lotNumber.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
        if (serials.length !== input.quantity) throw new UserError(`Броят серийни номера (${serials.length}) трябва да е равен на количеството (${input.quantity}).`);
        for (const serial of serials) {
          const dup = await tx.query.lots.findFirst({ where: and(eq(lots.itemId, item.id), eq(lots.serialNumber, serial)) });
          if (dup && dup.quantity > 0) throw new UserError(`Сериен номер ${serial} вече е в наличност.`);
          if (dup) await tx.update(lots).set({ quantity: 1, locationId: input.locationId }).where(eq(lots.id, dup.id));
          else await tx.insert(lots).values({ itemId: item.id, locationId: input.locationId, lotNumber: serial, serialNumber: serial, expiryDate: input.lot.expiryDate ?? null, quantity: 1 });
        }
      } else {
        const existing = await tx.query.lots.findFirst({ where: and(eq(lots.itemId, item.id), eq(lots.locationId, input.locationId), eq(lots.lotNumber, input.lot.lotNumber)) });
        if (existing) {
          await tx.update(lots).set({ quantity: addQty(existing.quantity, input.quantity), expiryDate: input.lot.expiryDate ?? existing.expiryDate }).where(eq(lots.id, existing.id));
          lotId = existing.id;
        } else {
          const [created] = await tx
            .insert(lots)
            .values({ itemId: item.id, locationId: input.locationId, lotNumber: input.lot.lotNumber, expiryDate: input.lot.expiryDate ?? null, quantity: input.quantity })
            .$returningId();
          lotId = created.id;
        }
      }
    }
  }

  if (level) await tx.update(stockLevels).set({ quantity: after }).where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.locationId, input.locationId)));
  else await tx.insert(stockLevels).values({ itemId: item.id, locationId: input.locationId, quantity: after });

  const totalAfter = addQty(item.quantity, delta);
  const cost = await costMovement(tx, item, { type: input.type, delta, unitCost: input.unitCost, orderId: input.orderId });
  await tx.update(items).set({ quantity: totalAfter, unitCost: cost.itemCost, updatedAt: new Date() }).where(eq(items.id, item.id));

  const [movement] = await tx.insert(stockMovements).values({
    itemId: item.id,
    locationId: input.locationId,
    lotId,
    userId: input.actor?.id ?? null,
    userName: input.actor?.name ?? (input.actor === null ? "API" : null),
    type: input.type,
    delta,
    quantityAfter: totalAfter,
    unitCost: cost.unitCost,
    value: cost.value,
    reason: input.reason ?? null,
    shipmentId: input.shipmentId ?? null,
  }).$returningId();
  if (cost.layer) await recordLayer(tx, item.id, movement.id, cost.layer);

  emit(tx, "movement.created", { itemId: item.id, sku: item.sku, locationId: input.locationId, type: input.type, delta, quantityAfter: totalAfter });
  if (item.minQuantity > 0 && totalAfter <= item.minQuantity && item.quantity > item.minQuantity) {
    emit(tx, "item.low_stock", { itemId: item.id, sku: item.sku, name: item.name, quantity: totalAfter, minQuantity: item.minQuantity });
  }
  return { delta, after: totalAfter, unitCost: cost.unitCost, value: cost.value };
}

/** Трансфер между две локации като двойка движения. */
export async function transferStock(db: TenantDb, input: { actor: Actor; itemId: number; fromLocationId: number; toLocationId: number; quantity: number; lotId?: number | null; reason?: string | null }) {
  if (input.fromLocationId === input.toLocationId) throw new UserError("Изберете две различни локации.");
  await db.transaction(async (tx) => {
    let lotForIn: LotInput = null;
    if (input.lotId) {
      const lot = await tx.query.lots.findFirst({ where: eq(lots.id, input.lotId) });
      if (!lot) throw new UserError("Партидата не е намерена.");
      lotForIn = { lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, serialNumber: lot.serialNumber };
    }
    const reason = input.reason ?? "Трансфер между локации";
    await applyMovement(tx, { ...input, locationId: input.fromLocationId, type: "transfer_out", reason, lot: input.lotId ? { lotId: input.lotId } : null });
    await applyMovement(tx, { ...input, locationId: input.toLocationId, type: "transfer_in", reason, lot: lotForIn });
  });
}

/** Редове от форма/API: количеството трябва да отговаря на мерната единица на артикула (цели бройки или до N знака). */
export async function assertItemQuantities(db: Db, lines: Array<{ itemId: number; quantity: number }>) {
  if (!lines.length) return;
  const rows = await db.query.items.findMany({ where: inArray(items.id, [...new Set(lines.map((l) => l.itemId))]) });
  const byId = new Map(rows.map((i) => [i.id, i]));
  for (const l of lines) {
    const item = byId.get(l.itemId);
    if (!item) throw new UserError("Артикулът не е намерен.");
    assertQuantity(l.quantity, itemDecimals(item), `„${item.name}“`);
  }
}

/** По-малко знаци след запетаята само ако никоя наличност или отворен ред на поръчка не ги използва. */
export async function assertFitsDecimals(db: Db, itemId: number, decimals: number) {
  const fits = (col: AnyColumn) => sql`${col} <> round(${col}, ${decimals})`;
  const [[level], [lot], [line]] = await Promise.all([
    db.select({ n: count() }).from(stockLevels).where(and(eq(stockLevels.itemId, itemId), fits(stockLevels.quantity))),
    db.select({ n: count() }).from(lots).where(and(eq(lots.itemId, itemId), fits(lots.quantity))),
    db.select({ n: count() }).from(orderLines).where(and(eq(orderLines.itemId, itemId), or(fits(orderLines.quantity), fits(orderLines.fulfilledQuantity)))),
  ]);
  if (level.n || lot.n || line.n) throw new UserError(`Наличността или поръчките на артикула имат повече от ${decimals} знака след запетаята — първо ги коригирайте.`);
}
