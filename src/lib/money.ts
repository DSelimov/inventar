import { UserError } from "./errors";

/**
 * Пари без грешки от плаваща запетая. В базата сумите са decimal(14,4) (Drizzle mode "number"),
 * тук всяко събиране и умножение минава през цели десетохилядни, а резултатите се закръглят
 * до стотинки (половинката — далеч от нулата). Модулът е и за клиентските компоненти.
 */

const SCALE = 10_000;
/** Таванът на decimal(14,4). */
export const MAX_MONEY = 9_999_999_999;

/** Сума → цели десетохилядни (точно за всяка стойност с до 4 знака след запетаята). */
function units(value: number) {
  return Math.sign(value) * Math.round(Math.abs(value) * SCALE) || 0;
}

/** Симетрично закръгляне на цяло число, делено на divisor. */
function divRound(n: number, divisor: number) {
  return (Math.sign(n) * Math.round(Math.abs(n) / divisor)) || 0;
}

/** Закръгляне до decimals знака (по подразбиране стотинки). */
export function roundMoney(value: number, decimals = 2) {
  const step = 10 ** (4 - decimals);
  return divRound(units(value), step) / (SCALE / step);
}

/** Количество × единична цена, закръглено до стотинки — стойността на един ред. */
export function lineTotal(quantity: number, unitAmount: number) {
  // количествата имат до 3 знака след запетаята → цели хилядни; произведението в BigInt, без загуба на точност
  const q = Math.sign(quantity) * Math.round(Math.abs(quantity) * 1000) || 0;
  const product = BigInt(q) * BigInt(units(unitAmount));
  const divisor = BigInt(1000 * 100);
  const negative = product < BigInt(0);
  const abs = negative ? -product : product;
  const cents = (abs + divisor / BigInt(2)) / divisor;
  return Number(negative ? -cents : cents) / 100;
}

/** Точна сума на стойности (всяка с до 4 знака). */
export function sumMoney(values: Iterable<number>) {
  let total = 0;
  for (const v of values) total += units(v);
  return total / SCALE;
}

/** Сума на редове: всеки ред се закръгля до стотинки, както в документите. */
export function sumLines<T>(rows: Iterable<T>, quantity: (row: T) => number, unitAmount: (row: T) => number) {
  let cents = 0;
  for (const r of rows) cents += Math.round(lineTotal(quantity(r), unitAmount(r)) * 100);
  return cents / 100;
}

/**
 * Въведена сума (форма, CSV, API) → число с до 4 знака. Приема запетая и интервали („1 234,50“).
 * Празно = fallback. Отрицателна, нечислова или твърде голяма сума е грешка за потребителя.
 */
export function parseMoney(raw: unknown, label = "Цена", fallback = 0) {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(/[\s ]/g, "").replace(",", "."));
  if (!Number.isFinite(value)) throw new UserError(`${label}: невалидна сума.`);
  if (value < 0) throw new UserError(`${label}: сумата не може да е отрицателна.`);
  if (value > MAX_MONEY) throw new UserError(`${label}: сумата е твърде голяма.`);
  return roundMoney(value, 4);
}
