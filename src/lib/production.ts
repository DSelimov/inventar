import "server-only";
/**
 * Производство по рецепта и разглобяване. Всичко минава през applyMovement (наличност, партиди,
 * себестойност), в една транзакция:
 *  - производство: съставките се изписват (produce_out) по метода на оценка; произведеното влиза
 *    (produce_in) със себестойност = сумата на вложеното / количеството;
 *  - разглобяване: артикулът се изписва; стойността му се разпределя по съставките пропорционално на
 *    текущата им доставна цена × количеството (или по количество, ако цените са 0).
 * Артикулите с партиди се изписват по FEFO; произведеното с партиди получава партида = номера на протокола.
 * Серийни номера не се поддържат в производството.
 */
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { items, lots, productionLines, productions, recipeLines, recipes, stockLevels, type Item, type ProductionKind } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { lineTotal, sumMoney, unitCostOf } from "./money";
import { nextNumber } from "./numbering";
import { assertQuantity, itemDecimals, scaleQty, subQty } from "./quantity";
import { applyMovement } from "./stock";

type Actor = { id: number; name: string } | null;

export type PlannedLine = { item: Item; quantity: number; available: number };

/** Какво ще се вложи/получи — за прегледа и за прилагането (едно и също изчисление). */
export async function planProduction(db: Db, p: { recipeId: number; quantity: number; locationId: number; kind: ProductionKind }) {
  const recipe = await db.query.recipes.findFirst({ where: eq(recipes.id, p.recipeId), with: { item: true, lines: { with: { item: true } } } });
  if (!recipe) throw new UserError("Рецептата не е намерена.");
  if (recipe.lines.length === 0) throw new UserError("Рецептата няма съставки.");
  if (!(p.quantity > 0)) throw new UserError("Количеството трябва да е положително.");
  const lines: PlannedLine[] = [];
  for (const l of recipe.lines) {
    const quantity = scaleQty(l.quantity, p.quantity, recipe.outputQuantity, itemDecimals(l.item));
    if (quantity <= 0) throw new UserError(`„${l.item.name}“: количеството е под най-малката единица (${l.item.unit}).`);
    lines.push({ item: l.item, quantity, available: await availableAt(db, l.item.id, p.locationId) });
  }
  return { recipe, output: recipe.item, outputAvailable: await availableAt(db, recipe.itemId, p.locationId), lines };
}

async function availableAt(db: Db, itemId: number, locationId: number) {
  const [row] = await db.select({ quantity: stockLevels.quantity }).from(stockLevels).where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.locationId, locationId)));
  return row?.quantity ?? 0;
}

/** Изписване: по FEFO от партидите в локацията или направо. Връща стойността (положителна). */
async function consume(tx: Db, actor: Actor, item: Item, locationId: number, quantity: number, reason: string) {
  if (item.tracking === "serial") throw new UserError(`„${item.name}“ е със серийни номера — изпишете го ръчно.`);
  if (item.tracking === "none") {
    const r = await applyMovement(tx, { actor, itemId: item.id, locationId, type: "produce_out", quantity, reason });
    return -r.value;
  }
  let left = quantity;
  let value = 0;
  const available = await tx.select().from(lots).where(and(eq(lots.itemId, item.id), eq(lots.locationId, locationId), gt(lots.quantity, 0))).orderBy(sql`${lots.expiryDate} is null`, asc(lots.expiryDate), asc(lots.id));
  for (const lot of available) {
    if (left <= 0) break;
    const take = Math.min(left, lot.quantity);
    const r = await applyMovement(tx, { actor, itemId: item.id, locationId, type: "produce_out", quantity: take, reason, lot: { lotId: lot.id } });
    value = sumMoney([value, -r.value]);
    left = subQty(left, take);
  }
  if (left > 0) throw new UserError(`Недостатъчна наличност от „${item.name}“ в партидите (липсват ${left} ${item.unit}).`);
  return value;
}

async function receive(tx: Db, actor: Actor, item: Item, locationId: number, quantity: number, unitCost: number, number: string, reason: string) {
  if (item.tracking === "serial") throw new UserError(`„${item.name}“ е със серийни номера — заприхождава се ръчно.`);
  await applyMovement(tx, { actor, itemId: item.id, locationId, type: "produce_in", quantity, unitCost, reason, lot: item.tracking === "lot" ? { lotNumber: number } : null });
}

/** Разпределя стойност по тегла до стотинка (цели стотинки, BigInt); остатъкът отива на последния ред. */
export function splitValue(total: number, weights: number[]) {
  const cents = (v: number) => BigInt(Math.round(v * 100));
  const w = weights.some((x) => x > 0) ? weights.map(cents) : weights.map(() => BigInt(1));
  const base = w.reduce((a, b) => a + b, BigInt(0));
  const t = cents(total);
  const out: number[] = [];
  let used = BigInt(0);
  w.forEach((x, i) => {
    const part = i === w.length - 1 ? t - used : (t * x * BigInt(2) + base) / (base * BigInt(2));
    out.push(Number(part) / 100);
    used += part;
  });
  return out;
}

export async function runProduction(db: TenantDb, actor: Actor, p: { recipeId: number; quantity: number; locationId: number; kind: ProductionKind; notes?: string | null }) {
  return db.transaction(async (tx) => {
    const plan = await planProduction(tx, p);
    const number = await nextNumber(tx, "production");
    const reason = `${p.kind === "assembly" ? "Производство" : "Разглобяване"} ${number}`;
    const rows: Array<{ itemId: number; direction: "in" | "out"; quantity: number; unitCost: number; value: number }> = [];
    let totalCost: number;

    if (p.kind === "assembly") {
      const values: number[] = [];
      for (const l of plan.lines) {
        const v = await consume(tx, actor, l.item, p.locationId, l.quantity, reason);
        values.push(v);
        rows.push({ itemId: l.item.id, direction: "out", quantity: l.quantity, unitCost: unitCostOf(v, l.quantity), value: v });
      }
      totalCost = sumMoney(values);
      const unitCost = unitCostOf(totalCost, p.quantity);
      await receive(tx, actor, plan.output, p.locationId, p.quantity, unitCost, number, reason);
      rows.push({ itemId: plan.output.id, direction: "in", quantity: p.quantity, unitCost, value: totalCost });
    } else {
      totalCost = await consume(tx, actor, plan.output, p.locationId, p.quantity, reason);
      rows.push({ itemId: plan.output.id, direction: "out", quantity: p.quantity, unitCost: unitCostOf(totalCost, p.quantity), value: totalCost });
      const parts = splitValue(totalCost, plan.lines.map((l) => lineTotal(l.quantity, l.item.unitCost)));
      for (const [i, l] of plan.lines.entries()) {
        const unitCost = unitCostOf(parts[i], l.quantity);
        await receive(tx, actor, l.item, p.locationId, l.quantity, unitCost, number, reason);
        rows.push({ itemId: l.item.id, direction: "in", quantity: l.quantity, unitCost, value: parts[i] });
      }
    }

    const [row] = await tx
      .insert(productions)
      .values({ number, kind: p.kind, recipeId: p.recipeId, itemId: plan.output.id, quantity: p.quantity, locationId: p.locationId, totalCost, notes: p.notes ?? null, createdBy: actor?.id ?? null, createdByName: actor?.name ?? null })
      .$returningId();
    await tx.insert(productionLines).values(rows.map((r) => ({ ...r, productionId: row.id })));
    return { id: row.id, number, totalCost };
  });
}

/** Записва рецептата и редовете ѝ наново (в транзакция). */
export async function saveRecipe(db: TenantDb, id: number | null, data: { itemId: number; name: string; outputQuantity: number; notes: string | null; active: boolean; lines: Array<{ itemId: number; quantity: number }> }) {
  if (data.lines.length === 0) throw new UserError("Добавете поне една съставка.");
  if (data.lines.some((l) => l.itemId === data.itemId)) throw new UserError("Артикулът не може да е съставка на собствената си рецепта.");
  const ids = new Set<number>();
  for (const l of data.lines) {
    if (ids.has(l.itemId)) throw new UserError("Всяка съставка може да е само на един ред.");
    ids.add(l.itemId);
  }
  const all = await db.select().from(items).where(inArray(items.id, [data.itemId, ...ids]));
  for (const l of data.lines) {
    const it = all.find((x) => x.id === l.itemId);
    if (!it) throw new UserError("Съставката не е намерена.");
    assertQuantity(l.quantity, itemDecimals(it), `„${it.name}“`);
    if (!(l.quantity > 0)) throw new UserError(`„${it.name}“: количеството трябва да е положително.`);
  }
  const out = all.find((x) => x.id === data.itemId);
  if (!out) throw new UserError("Артикулът не е намерен.");
  assertQuantity(data.outputQuantity, itemDecimals(out), "Добив");
  if (!(data.outputQuantity > 0)) throw new UserError("Добивът трябва да е положителен.");
  return db.transaction(async (tx) => {
    const { lines, ...head } = data;
    let recipeId = id;
    if (recipeId) await tx.update(recipes).set(head).where(eq(recipes.id, recipeId));
    else [{ id: recipeId }] = await tx.insert(recipes).values(head).$returningId();
    await tx.delete(recipeLines).where(eq(recipeLines.recipeId, recipeId!));
    await tx.insert(recipeLines).values(lines.map((l) => ({ ...l, recipeId: recipeId! })));
    return recipeId!;
  });
}
