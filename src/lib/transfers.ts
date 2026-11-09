import "server-only";
/*
 * Трансфер между обекти (ТР-ГГГГ-NNN): склад → аптека, аптека → склад, склад → хладилна камера…
 * Черновата не пипа наличността; „Изпълни“ мести всички редове в една транзакция през applyMovement
 * (transfer_out от изходната и transfer_in в целевата локация, по текущата себестойност).
 * Артикул с партиди/серийни номера без избрана партида се взема по най-близък срок (FEFO).
 */
import { and, asc, desc, eq, gt, inArray, like, sql } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { itemUnits, items, locations, lots, stockLevels, stockMovements, transferLines, transfers, type Item, type TransferStatus } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";
import { assertQuantity, itemDecimals, subQty } from "./quantity";
import { applyMovement, assertLocationAccess, type Actor } from "./stock";

export type TransferLineInput = { itemId: number; quantity: number; lotId?: number | null };
export type TransferInput = { fromLocationId: number; toLocationId: number; notes?: string | null; lines: TransferLineInput[] };

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = { draft: "Чернова", completed: "Изпълнен" };

async function validate(db: Db, actor: Actor, input: TransferInput) {
  if (!input.fromLocationId || !input.toLocationId) throw new UserError("Изберете от коя и към коя локация.");
  if (input.fromLocationId === input.toLocationId) throw new UserError("Изберете две различни локации.");
  assertLocationAccess(actor, input.fromLocationId);
  assertLocationAccess(actor, input.toLocationId);
  const lines = input.lines.filter((l) => l.itemId > 0 && l.quantity > 0);
  if (!lines.length) throw new UserError("Добавете поне един артикул.");
  const ids = [...new Set(lines.map((l) => l.itemId))];
  const rows = await db.select().from(items).where(inArray(items.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lotIds = lines.map((l) => l.lotId).filter((x): x is number => !!x);
  const lotRows = lotIds.length ? await db.select().from(lots).where(inArray(lots.id, lotIds)) : [];
  for (const l of lines) {
    const item = byId.get(l.itemId);
    if (!item) throw new UserError("Артикулът не е намерен.");
    assertQuantity(l.quantity, itemDecimals(item), `„${item.name}“`);
    if (l.lotId) {
      const lot = lotRows.find((x) => x.id === l.lotId);
      if (!lot || lot.itemId !== item.id) throw new UserError(`Партидата не е на „${item.name}“.`);
      if (item.tracking === "serial" && l.quantity !== 1) throw new UserError(`„${item.name}“: сериен номер ${lot.lotNumber} е една бройка.`);
    } else if (item.tracking === "none") l.lotId = null;
  }
  return lines;
}

/** Нова чернова или промяна на чернова (редовете се заменят). */
export async function saveTransfer(db: TenantDb, actor: Actor, input: TransferInput, id?: number) {
  const lines = await validate(db, actor, input);
  return db.transaction(async (tx) => {
    let transferId = id ?? 0;
    let number: string;
    if (id) {
      const [t] = await tx.select().from(transfers).where(eq(transfers.id, id)).for("update");
      if (!t) throw new UserError("Трансферът не е намерен.");
      if (t.status !== "draft") throw new UserError("Изпълнен трансфер не се променя.");
      number = t.number;
      await tx.update(transfers).set({ fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, notes: input.notes ?? null }).where(eq(transfers.id, id));
      await tx.delete(transferLines).where(eq(transferLines.transferId, id));
    } else {
      number = await nextNumber(tx, "transfer");
      const [r] = await tx
        .insert(transfers)
        .values({ number, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, notes: input.notes ?? null, createdBy: actor?.id ?? null, createdByName: actor?.name ?? null })
        .$returningId();
      transferId = r.id;
    }
    await tx.insert(transferLines).values(lines.map((l) => ({ transferId, itemId: l.itemId, quantity: l.quantity, lotId: l.lotId ?? null })));
    return { id: transferId, number };
  });
}

/** Мести един ред: конкретна партида, по FEFO или без партиди. */
async function moveLine(tx: Db, actor: Actor, item: Item, line: { quantity: number; lotId: number | null }, from: number, to: number, reason: string) {
  const move = async (quantity: number, lot: typeof lots.$inferSelect | null) => {
    await applyMovement(tx, { actor, itemId: item.id, locationId: from, type: "transfer_out", quantity, reason, lot: lot ? { lotId: lot.id } : null });
    await applyMovement(tx, {
      actor,
      itemId: item.id,
      locationId: to,
      type: "transfer_in",
      quantity,
      reason,
      lot: lot ? { lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, serialNumber: lot.serialNumber } : null,
    });
  };
  if (item.tracking === "none") return move(line.quantity, null);
  if (line.lotId) {
    const [lot] = await tx.select().from(lots).where(eq(lots.id, line.lotId));
    if (!lot || lot.locationId !== from) throw new UserError(`„${item.name}“: партидата вече не е в изходната локация.`);
    return move(line.quantity, lot);
  }
  const available = await tx
    .select()
    .from(lots)
    .where(and(eq(lots.itemId, item.id), eq(lots.locationId, from), gt(lots.quantity, 0)))
    .orderBy(sql`${lots.expiryDate} is null`, asc(lots.expiryDate), asc(lots.id));
  let left = line.quantity;
  for (const lot of available) {
    if (left <= 0) break;
    const take = Math.min(left, lot.quantity);
    await move(take, lot);
    left = subQty(left, take);
  }
  if (left > 0) throw new UserError(`Недостатъчна наличност от „${item.name}“ в изходната локация (липсват ${left} ${item.unit}).`);
}

/** Изпълнява черновата: всички редове или нито един. */
export async function completeTransfer(db: TenantDb, actor: Actor, id: number) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(transfers).where(eq(transfers.id, id)).for("update");
    if (!t) throw new UserError("Трансферът не е намерен.");
    if (t.status !== "draft") throw new UserError("Трансферът вече е изпълнен.");
    assertLocationAccess(actor, t.fromLocationId);
    assertLocationAccess(actor, t.toLocationId);
    const locs = await tx.select({ id: locations.id, name: locations.name }).from(locations).where(inArray(locations.id, [t.fromLocationId, t.toLocationId]));
    const name = (lid: number) => locs.find((l) => l.id === lid)?.name ?? "—";
    const reason = `Трансфер ${t.number}: ${name(t.fromLocationId)} → ${name(t.toLocationId)}`;
    const lines = await tx.select().from(transferLines).where(eq(transferLines.transferId, id)).orderBy(asc(transferLines.id));
    if (!lines.length) throw new UserError("Трансферът няма редове.");
    const rows = await tx.select().from(items).where(inArray(items.id, [...new Set(lines.map((l) => l.itemId))]));
    for (const l of lines) await moveLine(tx, actor, rows.find((r) => r.id === l.itemId)!, l, t.fromLocationId, t.toLocationId, reason);
    await tx.update(transfers).set({ status: "completed", completedAt: new Date(), completedByName: actor?.name ?? null }).where(eq(transfers.id, id));
    return { number: t.number, lines: lines.length };
  });
}

export async function deleteDraftTransfer(db: TenantDb, id: number) {
  const [t] = await db.select().from(transfers).where(eq(transfers.id, id));
  if (!t) throw new UserError("Трансферът не е намерен.");
  if (t.status !== "draft") throw new UserError("Изпълнен трансфер не се изтрива — направете обратен трансфер.");
  await db.delete(transfers).where(eq(transfers.id, id));
  return t;
}

// ----------------------------------------------------------------------- reads
export async function listTransfers(db: Db, o: { status?: TransferStatus | null; locationId?: number | null; allowed?: number[] | null; limit?: number } = {}) {
  const fromLoc = sql<string>`(select name from ${locations} where ${locations.id} = ${transfers.fromLocationId})`;
  const toLoc = sql<string>`(select name from ${locations} where ${locations.id} = ${transfers.toLocationId})`;
  const conds = [
    o.status ? eq(transfers.status, o.status) : undefined,
    o.locationId ? sql`(${transfers.fromLocationId} = ${o.locationId} or ${transfers.toLocationId} = ${o.locationId})` : undefined,
    o.allowed ? sql`(${inArray(transfers.fromLocationId, o.allowed)} or ${inArray(transfers.toLocationId, o.allowed)})` : undefined,
  ];
  return db
    .select({
      id: transfers.id,
      number: transfers.number,
      status: transfers.status,
      fromName: fromLoc,
      toName: toLoc,
      createdAt: transfers.createdAt,
      createdByName: transfers.createdByName,
      completedAt: transfers.completedAt,
      lines: sql<number>`(select count(*) from ${transferLines} where ${transferLines.transferId} = ${transfers.id})`.mapWith(Number),
      units: sql<number>`(select coalesce(sum(quantity), 0) from ${transferLines} where ${transferLines.transferId} = ${transfers.id})`.mapWith(Number),
    })
    .from(transfers)
    .where(and(...conds))
    .orderBy(desc(transfers.createdAt), desc(transfers.id))
    .limit(o.limit ?? 100);
}

export async function getTransfer(db: Db, id: number) {
  const [t] = await db.select().from(transfers).where(eq(transfers.id, id));
  if (!t) return null;
  const locs = await db.select().from(locations).where(inArray(locations.id, [t.fromLocationId, t.toLocationId]));
  const lines = await db
    .select({
      id: transferLines.id,
      itemId: transferLines.itemId,
      quantity: transferLines.quantity,
      lotId: transferLines.lotId,
      sku: items.sku,
      name: items.name,
      variant: items.variantLabel,
      unit: items.unit,
      tracking: items.tracking,
      unitCost: items.unitCost,
      lotNumber: lots.lotNumber,
      expiryDate: lots.expiryDate,
    })
    .from(transferLines)
    .innerJoin(items, eq(items.id, transferLines.itemId))
    .leftJoin(lots, eq(lots.id, transferLines.lotId))
    .where(eq(transferLines.transferId, id))
    .orderBy(asc(transferLines.id));
  return { ...t, from: locs.find((l) => l.id === t.fromLocationId) ?? null, to: locs.find((l) => l.id === t.toLocationId) ?? null, lines };
}

/** Изпълнен трансфер: реално преместените партиди по артикул (вкл. избраните автоматично по срок). */
export async function transferMovedLots(db: Db, number: string) {
  return db
    // изходящото движение пази партидата и при серийни номера (входящото — не винаги)
    .select({ itemId: stockMovements.itemId, quantity: sql<number>`-${stockMovements.delta}`.mapWith(Number), lotNumber: lots.lotNumber, expiryDate: lots.expiryDate })
    .from(stockMovements)
    .leftJoin(lots, eq(lots.id, stockMovements.lotId))
    .where(and(eq(stockMovements.type, "transfer_out"), like(stockMovements.reason, `Трансфер ${number}:%`)))
    .orderBy(asc(stockMovements.id));
}

/** Данни за формата: активни артикули с наличност по локации, партиди в наличност и опаковки (баркодове). */
export async function transferFormData(db: Db) {
  const [itemRows, levels, lotRows, units] = await Promise.all([
    db
      .select({ id: items.id, sku: items.sku, barcode: items.barcode, name: items.name, variant: items.variantLabel, unit: items.unit, tracking: items.tracking, quantityDecimals: items.quantityDecimals })
      .from(items)
      .where(eq(items.status, "active"))
      .orderBy(asc(items.name), asc(items.variantLabel)),
    db.select({ itemId: stockLevels.itemId, locationId: stockLevels.locationId, quantity: stockLevels.quantity }).from(stockLevels).where(gt(stockLevels.quantity, 0)),
    db
      .select({ id: lots.id, itemId: lots.itemId, locationId: lots.locationId, lotNumber: lots.lotNumber, expiryDate: lots.expiryDate, quantity: lots.quantity })
      .from(lots)
      .where(gt(lots.quantity, 0))
      .orderBy(sql`${lots.expiryDate} is null`, asc(lots.expiryDate), asc(lots.id)),
    db.select({ itemId: itemUnits.itemId, name: itemUnits.name, factor: itemUnits.factor, barcode: itemUnits.barcode }).from(itemUnits),
  ]);
  return { items: itemRows, levels, lots: lotRows, units };
}

