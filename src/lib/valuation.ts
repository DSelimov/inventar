import "server-only";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { costLayers, settings, stockMovements, type Item, type MovementType } from "@/db/tenant-schema";
import { lineTotal, sumMoney, unitCostOf, weightedAverage } from "./money";
import { addQty, subQty } from "./quantity";

/**
 * Оценка на наличността (себестойност на всяко движение):
 *  - average — средно претеглена: приходът преизчислява средната цена на артикула, разходът е по нея;
 *  - fifo — всеки приход е слой (cost_layers), разходът изчерпва най-старите слоеве.
 * Трансферите между локации не сменят оценката: изходът и входът са по текущата цена и се неутрализират.
 * Методът се избира, преди да има движения (смяната по-късно би смесила два метода в историята).
 */
export const VALUATION_METHODS = ["average", "fifo"] as const;
export type ValuationMethod = (typeof VALUATION_METHODS)[number];
export const VALUATION_KEY = "valuationMethod";

export async function getValuationMethod(db: Db): Promise<ValuationMethod> {
  const [row] = await db.select().from(settings).where(eq(settings.key, VALUATION_KEY));
  return row?.value === "fifo" ? "fifo" : "average";
}

export type CostInput = {
  type: MovementType;
  /** Промяната в количеството (± ), вече проверена. */
  delta: number;
  /** Цена за единица, ако е известна: приход по доставка, връщане по оригиналната цена. */
  unitCost?: number | null;
  /** Поръчката, към която е движението: слоевете на приход се маркират с нея; връщане към доставчик ги изписва първо. */
  orderId?: number | null;
};

export type Costed = {
  unitCost: number;
  value: number;
  /** Новата средна доставна цена на артикула (items.unit_cost). */
  itemCost: number;
  /** За fifo приход: слой, който се създава след записа на движението. */
  layer: { quantity: number; unitCost: number; orderId: number | null } | null;
};

/** Изчислява себестойността на движение. item е заключеният ред (FOR UPDATE), item.quantity е общото преди движението. */
export async function costMovement(tx: Db, item: Item, input: CostInput): Promise<Costed> {
  const method = await getValuationMethod(tx);
  const transfer = input.type === "transfer_in" || input.type === "transfer_out";
  const current = item.unitCost;

  if (transfer) return { unitCost: current, value: lineTotal(input.delta, current), itemCost: current, layer: null };

  if (input.delta > 0) {
    const unitCost = input.unitCost ?? current;
    const itemCost = method === "fifo" ? await layersAverage(tx, item.id, { quantity: input.delta, unitCost }) : weightedAverage(Math.max(0, item.quantity), current, input.delta, unitCost);
    return { unitCost, value: lineTotal(input.delta, unitCost), itemCost, layer: method === "fifo" ? { quantity: input.delta, unitCost, orderId: input.orderId ?? null } : null };
  }

  const out = -input.delta;
  if (method === "average") {
    // изписване по средната; връщане към доставчик — по цената, на която е получено
    const unitCost = input.unitCost ?? current;
    const after = subQty(item.quantity, out);
    const itemCost = unitCost === current || after <= 0 ? current : Math.max(0, weightedAverage(item.quantity, current, input.delta, unitCost));
    return { unitCost, value: lineTotal(input.delta, unitCost), itemCost, layer: null };
  }

  const value = -(await consumeLayers(tx, item, out, input.orderId ?? null));
  return { unitCost: unitCostOf(-value, out), value, itemCost: await layersAverage(tx, item.id), layer: null };
}

/** Записва fifo слоя след движението (нужен е идентификаторът му). */
export async function recordLayer(tx: Db, itemId: number, movementId: number, layer: NonNullable<Costed["layer"]>) {
  await tx.insert(costLayers).values({ itemId, movementId, orderId: layer.orderId, originalQuantity: layer.quantity, quantity: layer.quantity, unitCost: layer.unitCost });
}

/**
 * Изписва qty от слоевете: първо тези на поръчката (връщане към доставчик), после най-старите.
 * Връща стойността (положителна, до стотинка). Ако слоевете не стигат (стари данни), остатъкът е по текущата цена.
 */
async function consumeLayers(tx: Db, item: Item, qty: number, orderId: number | null) {
  const open = await tx.select().from(costLayers).where(and(eq(costLayers.itemId, item.id), gt(costLayers.quantity, 0))).orderBy(asc(costLayers.id)).for("update");
  const ordered = orderId === null ? open : [...open.filter((l) => l.orderId === orderId), ...open.filter((l) => l.orderId !== orderId)];
  let left = qty;
  const values: number[] = [];
  for (const layer of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, layer.quantity);
    values.push(lineTotal(take, layer.unitCost));
    left = subQty(left, take);
    await tx.update(costLayers).set({ quantity: subQty(layer.quantity, take) }).where(eq(costLayers.id, layer.id));
  }
  if (left > 0) values.push(lineTotal(left, item.unitCost));
  return sumMoney(values);
}

/** Средната цена на оставащите слоеве (по избор с още един, който предстои да се запише). */
async function layersAverage(tx: Db, itemId: number, extra?: { quantity: number; unitCost: number }) {
  const open = await tx.select({ quantity: costLayers.quantity, unitCost: costLayers.unitCost }).from(costLayers).where(and(eq(costLayers.itemId, itemId), gt(costLayers.quantity, 0)));
  if (extra) open.push(extra);
  let q = 0;
  let avg = 0;
  for (const l of open) {
    avg = weightedAverage(q, avg, l.quantity, l.unitCost);
    q = addQty(q, l.quantity);
  }
  return q > 0 ? avg : (extra?.unitCost ?? 0);
}

/** Средната единична себестойност (по unit_cost, не по закръглената стойност), с която артикулът е излязъл/влязъл по пратките на поръчка (за връщания по оригиналната цена). */
export async function orderMovementCost(tx: Db, orderId: number, itemId: number, direction: "in" | "out") {
  const [row] = await tx
    .select({ qty: sql<number>`coalesce(sum(${stockMovements.delta}), 0)`.mapWith(Number), value: sql<number>`coalesce(sum(${stockMovements.delta} * ${stockMovements.unitCost}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(and(eq(stockMovements.itemId, itemId), eq(stockMovements.type, direction), sql`${stockMovements.shipmentId} in (select id from shipments where order_id = ${orderId} and is_return = false)`));
  return row && row.qty !== 0 ? unitCostOf(row.value, row.qty) : null;
}
