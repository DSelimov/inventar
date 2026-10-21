import { UserError } from "./errors";

/**
 * Количества с до 3 знака след запетаята (кг, л, м). В базата са decimal(14,3) (Drizzle mode "number");
 * тук събирането минава през цели хилядни, за да няма 0.30000000000000004 в наличностите.
 * Броят знаци е на артикула (items.quantity_decimals): 0 за бр., до 3 за мерни единици.
 * Модулът е и за клиентските компоненти.
 */

const SCALE = 1000;
export const MAX_DECIMALS = 3;
/** Таванът на decimal(14,3). */
export const MAX_QUANTITY = 99_999_999_999;

function units(value: number) {
  return Math.sign(value) * Math.round(Math.abs(value) * SCALE) || 0;
}

/** Точна сума на количества. */
export function addQty(...values: number[]) {
  let total = 0;
  for (const v of values) total += units(v);
  return total / SCALE;
}

/** a − b, точно. */
export function subQty(a: number, b: number) {
  return (units(a) - units(b)) / SCALE;
}

/** a × b за количества (напр. брой опаковки × фактор), закръглено до хилядни. */
export function mulQty(a: number, b: number) {
  const product = BigInt(units(a)) * BigInt(units(b)); // милионни
  const negative = product < BigInt(0);
  const abs = negative ? -product : product;
  const r = (abs + BigInt(500)) / BigInt(1000);
  return Number(negative ? -r : r) / SCALE;
}

/** Точна сума по редове. */
export function sumQty<T>(rows: Iterable<T>, quantity: (row: T) => number) {
  let total = 0;
  for (const r of rows) total += units(quantity(r));
  return total / SCALE;
}

/** Броят знаци след запетаята (по най-краткия запис на числото, напр. 0.1 → 1, 1e-7 → 7). */
export function decimalsOf(value: number) {
  const [mantissa, exp] = String(Math.abs(value)).split("e");
  const fraction = mantissa.split(".")[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exp ?? 0));
}

/** Допустимите знаци за артикул: серийните номера са винаги цели. */
export function itemDecimals(item: { quantityDecimals?: number | null; tracking?: string }) {
  if (item.tracking === "serial") return 0;
  return Math.min(MAX_DECIMALS, Math.max(0, item.quantityDecimals ?? 0));
}

/** quantityDecimals от API/форма: цяло число 0–3, иначе грешка. */
export function readDecimals(raw: unknown) {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_DECIMALS) throw new UserError(`quantityDecimals трябва да е цяло число от 0 до ${MAX_DECIMALS}.`);
  return n;
}

/** Стъпката за <input type="number">. */
export function quantityStep(decimals: number) {
  return decimals > 0 ? (1 / 10 ** decimals).toFixed(decimals) : "1";
}

/**
 * Въведено количество (форма, CSV, API) → число. Приема запетая и интервали.
 * Празно = fallback. Отрицателно, нечислово, твърде голямо или с повече знаци от позволените е грешка.
 */
export function parseQuantity(raw: unknown, decimals = 0, label = "Количество", fallback = 0) {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(/[\s ]/g, "").replace(",", "."));
  if (!Number.isFinite(value)) throw new UserError(`${label}: невалидно количество.`);
  if (value < 0) throw new UserError(`${label}: количеството не може да е отрицателно.`);
  if (value > MAX_QUANTITY) throw new UserError(`${label}: количеството е твърде голямо.`);
  // никога не закръгляме мълчаливо: 0.0004 или 1.5 бр. са грешка, не 0 или 2
  if (decimalsOf(value) > decimals) {
    throw new UserError(decimals === 0 ? `${label}: въведете цяло число.` : `${label}: най-много ${decimals} знака след запетаята.`);
  }
  return units(value) / SCALE;
}

/** Проверява вече разчетено количество спрямо артикула (за stock engine и API). */
export function assertQuantity(value: number, decimals: number, label = "Количество") {
  return parseQuantity(value, decimals, label);
}
