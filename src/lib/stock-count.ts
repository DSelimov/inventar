import "server-only";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { items, lots, stockCountLines, stockCounts, stockLevels, type StockCountLine } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { applyMovement, type Actor } from "./stock";
import { lineTotal, sumMoney } from "@/lib/money";
import { addQty, assertQuantity, itemDecimals, subQty } from "./quantity";

/**
 * Инвентаризация: при създаване се записва снимка на очакваните количества в локацията (по артикул,
 * а при партиди/серийни номера — по партида). Корекцията при прилагане е разликата преброено − очаквано,
 * приложена към текущата наличност: движенията по време на броенето не се губят.
 */

export async function nextCountNumber(db: Db) {
  const year = new Date().getFullYear();
  const [row] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(stockCounts).where(sql`year(${stockCounts.createdAt}) = ${year}`);
  return `ИНВ-${year}-${String((row?.n ?? 0) + 1).padStart(3, "0")}`;
}

export async function createStockCount(db: TenantDb, o: { locationId: number; categoryId?: number | null; includeZero?: boolean; notes?: string | null; createdBy: string }) {
  const itemWhere = and(eq(items.status, "active"), o.categoryId ? eq(items.categoryId, o.categoryId) : undefined);
  const [plain, levels, lotRows] = await Promise.all([
    db.select({ id: items.id }).from(items).where(and(itemWhere, eq(items.tracking, "none"))).orderBy(asc(items.name), asc(items.variantLabel)),
    db.select({ itemId: stockLevels.itemId, qty: stockLevels.quantity }).from(stockLevels).where(eq(stockLevels.locationId, o.locationId)),
    db
      .select({ lot: lots })
      .from(lots)
      .innerJoin(items, eq(items.id, lots.itemId))
      .where(and(itemWhere, eq(lots.locationId, o.locationId), gt(lots.quantity, 0)))
      .orderBy(asc(items.name), asc(lots.expiryDate), asc(lots.lotNumber)),
  ]);
  const levelOf = new Map(levels.map((l) => [l.itemId, l.qty]));
  const lines: Array<Omit<typeof stockCountLines.$inferInsert, "countId">> = [
    ...plain.filter((i) => o.includeZero || (levelOf.get(i.id) ?? 0) !== 0).map((i) => ({ itemId: i.id, expected: levelOf.get(i.id) ?? 0 })),
    ...lotRows.map(({ lot }) => ({ itemId: lot.itemId, lotId: lot.id, lotNumber: lot.lotNumber, expected: lot.quantity })),
  ];
  if (!lines.length) throw new UserError("В тази локация няма артикули за броене (опитайте „включи и нулевите“).");

  return db.transaction(async (tx) => {
    const number = await nextCountNumber(tx);
    const [{ id }] = await tx.insert(stockCounts).values({ number, locationId: o.locationId, categoryId: o.categoryId ?? null, notes: o.notes ?? null, createdBy: o.createdBy }).$returningId();
    for (let i = 0; i < lines.length; i += 500) await tx.insert(stockCountLines).values(lines.slice(i, i + 500).map((l) => ({ ...l, countId: id })));
    return { id, number, lines: lines.length };
  });
}

async function openCount(db: Db, countId: number) {
  const [count] = await db.select().from(stockCounts).where(eq(stockCounts.id, countId)).limit(1);
  if (!count) throw new UserError("Инвентаризацията не е намерена.");
  if (count.status !== "open") throw new UserError("Инвентаризацията вече е приключена.");
  return count;
}

/**
 * Сканиран или въведен код → ред. Кодът може да е баркод/код на артикул или номер на партида/сериен номер.
 * mode "add" прибавя (всяко сканиране +1), "set" задава точното количество.
 */
export async function recordCount(db: TenantDb, countId: number, code: string, quantity: number, mode: "add" | "set" = "add") {
  const count = await openCount(db, countId);
  code = code.trim();
  if (!code) throw new UserError("Въведете или сканирайте код.");

  const lines = await db.select({ line: stockCountLines, item: items }).from(stockCountLines).innerJoin(items, eq(items.id, stockCountLines.itemId)).where(eq(stockCountLines.countId, countId));
  const key = code.toLowerCase();
  const byLot = lines.filter((l) => l.line.lotNumber?.toLowerCase() === key);
  // един и същ номер на партида при няколко артикула: сканирането не може да избере реда
  if (new Set(byLot.map((l) => l.line.itemId)).size > 1) throw new UserError(`Партида „${code}“ е при няколко артикула — въведете количеството в таблицата.`);
  let match = byLot[0];
  if (!match) {
    // MySQL сравнява без значение на регистъра — същото и тук, иначе резервното търсене добавя дублиран ред
    const forItem = lines.filter((l) => l.item.barcode?.toLowerCase() === key || l.item.sku.toLowerCase() === key);
    if (forItem.length > 1) throw new UserError(`„${forItem[0].item.name}“ е с партиди/серийни номера — сканирайте номера на партидата.`);
    match = forItem[0];
  }
  let line: StockCountLine;
  let item;
  if (match) {
    ({ line, item } = match);
  } else {
    // артикул, който не е в списъка (напр. намерен на място без наличност в системата)
    item = await db.query.items.findFirst({ where: or(eq(items.barcode, code), eq(items.sku, code)) });
    if (!item) throw new UserError(`Няма артикул с код „${code}“.`);
    if (item.tracking !== "none") throw new UserError(`„${item.name}“ е с партиди/серийни номера — добавете партидата от формата „Нова партида“.`);
    assertQuantity(quantity, itemDecimals(item), `„${item.name}“`); // преди да добавим ред
    const [level] = await db.select().from(stockLevels).where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.locationId, count.locationId)));
    const [{ id }] = await db.insert(stockCountLines).values({ countId, itemId: item.id, expected: level?.quantity ?? 0 }).$returningId();
    [line] = await db.select().from(stockCountLines).where(eq(stockCountLines.id, id));
  }
  assertQuantity(quantity, itemDecimals(item), `„${item.name}“`);
  // "add" се изчислява в SQL: паралелни сканирания (камера + скенер, двама броячи) не губят бройки
  const next = mode === "add" ? sql`coalesce(${stockCountLines.counted}, 0) + ${quantity}` : sql`${quantity}`;
  await db
    .update(stockCountLines)
    .set({ counted: item.tracking === "serial" ? sql`least(${next}, 1)` : next, countedAt: new Date() })
    .where(eq(stockCountLines.id, line.id));
  const [row] = await db.select({ counted: stockCountLines.counted }).from(stockCountLines).where(eq(stockCountLines.id, line.id));
  return { item, line: { ...line, counted: row?.counted ?? null } };
}

/** Нова партида (или сериен номер), открита при броенето, за артикул с проследяване. */
export async function addLotLine(db: TenantDb, countId: number, itemId: number, lotNumber: string, counted: number) {
  await openCount(db, countId);
  const item = await db.query.items.findFirst({ where: eq(items.id, itemId) });
  if (!item) throw new UserError("Артикулът не е намерен.");
  if (item.tracking === "none") throw new UserError("Артикулът е без партиди — сканирайте кода му.");
  lotNumber = lotNumber.trim();
  if (!lotNumber) throw new UserError("Въведете номер на партида / сериен номер.");
  const [dup] = await db.select({ id: stockCountLines.id }).from(stockCountLines).where(and(eq(stockCountLines.countId, countId), eq(stockCountLines.itemId, itemId), eq(stockCountLines.lotNumber, lotNumber)));
  if (dup) throw new UserError(`Партида „${lotNumber}“ вече е в списъка.`);
  assertQuantity(counted, itemDecimals(item), `„${item.name}“`);
  const value = item.tracking === "serial" ? Math.min(1, counted) : counted;
  await db.insert(stockCountLines).values({ countId, itemId, lotNumber, expected: 0, counted: value, countedAt: new Date() });
}

/** Ръчно въведени количества от таблицата: празно = неброено. */
export async function saveCountedValues(db: TenantDb, countId: number, values: Map<number, number | null>) {
  await openCount(db, countId);
  const lines = await db.select({ id: stockCountLines.id, counted: stockCountLines.counted, item: items }).from(stockCountLines).innerJoin(items, eq(items.id, stockCountLines.itemId)).where(eq(stockCountLines.countId, countId));
  const own = new Map(lines.map((l) => [l.id, l.counted]));
  const itemOf = new Map(lines.map((l) => [l.id, l.item]));
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const [id, value] of values) {
      if (!own.has(id) || own.get(id) === value) continue;
      if (value !== null) {
        const item = itemOf.get(id)!;
        assertQuantity(value, itemDecimals(item), `„${item.name}“`);
      }
      await tx.update(stockCountLines).set({ counted: value, countedAt: value === null ? null : new Date() }).where(eq(stockCountLines.id, id));
      changed++;
    }
  });
  return changed;
}

/** Прилага разликите в една транзакция. Неброените редове се пропускат, освен при uncountedAsZero. */
export async function applyStockCount(db: TenantDb, countId: number, actor: Actor & object, o: { uncountedAsZero?: boolean } = {}) {
  const count = await openCount(db, countId);
  const reason = `Инвентаризация ${count.number}`;
  let adjusted = 0;
  let valueDelta = 0;

  await db.transaction(async (tx) => {
    // Заема инвентаризацията атомарно: при две паралелни прилагания само едното минава.
    const [res] = await tx.update(stockCounts).set({ status: "applied", appliedAt: new Date(), appliedBy: actor.name }).where(and(eq(stockCounts.id, countId), eq(stockCounts.status, "open")));
    if (res.affectedRows !== 1) throw new UserError("Инвентаризацията вече е приключена.");
    const lines = await tx.query.stockCountLines.findMany({ where: eq(stockCountLines.countId, countId), with: { item: true, lot: true } });
    for (const l of lines) {
      const counted = l.counted ?? (o.uncountedAsZero ? 0 : null);
      if (counted === null) continue;
      const delta = subQty(counted, l.expected);
      if (delta === 0) continue;
      if (l.item.tracking === "none") {
        const [level] = await tx.select().from(stockLevels).where(and(eq(stockLevels.itemId, l.itemId), eq(stockLevels.locationId, count.locationId)));
        await applyMovement(tx, { actor, itemId: l.itemId, locationId: count.locationId, type: "adjust", quantity: Math.max(0, addQty(level?.quantity ?? 0, delta)), reason });
      } else if (delta > 0) {
        await applyMovement(tx, { actor, itemId: l.itemId, locationId: count.locationId, type: "in", quantity: delta, reason, lot: { lotNumber: l.lotNumber ?? l.lot?.lotNumber ?? "", expiryDate: l.lot?.expiryDate ?? null } });
      } else {
        if (!l.lotId) continue; // нова партида, преброена като 0 — няма какво да се изпише
        await applyMovement(tx, { actor, itemId: l.itemId, locationId: count.locationId, type: "out", quantity: -delta, reason, lot: { lotId: l.lotId } });
      }
      adjusted++;
      valueDelta = sumMoney([valueDelta, lineTotal(delta, l.item.unitCost)]);
    }
  });
  return { adjusted, valueDelta, number: count.number };
}

export async function cancelStockCount(db: TenantDb, countId: number) {
  await openCount(db, countId);
  await db.update(stockCounts).set({ status: "cancelled" }).where(eq(stockCounts.id, countId));
}
