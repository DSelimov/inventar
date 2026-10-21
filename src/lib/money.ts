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
export function parseMoney(raw: unknown, label?: string, fallback?: number): number;
export function parseMoney(raw: unknown, label: string, fallback: null): number | null;
export function parseMoney(raw: unknown, label = "Цена", fallback: number | null = 0): number | null {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(/[\s ]/g, "").replace(",", "."));
  if (!Number.isFinite(value)) throw new UserError(`${label}: невалидна сума.`);
  if (value < 0) throw new UserError(`${label}: сумата не може да е отрицателна.`);
  if (value > MAX_MONEY) throw new UserError(`${label}: сумата е твърде голяма.`);
  return roundMoney(value, 4);
}

/** a / b за цели BigInt, закръглено половинката далеч от нулата. */
function bigDivRound(a: bigint, b: bigint) {
  const negative = a < BigInt(0) !== b < BigInt(0);
  const absA = a < BigInt(0) ? -a : a;
  const absB = b < BigInt(0) ? -b : b;
  const q = (absA * BigInt(2) + absB) / (absB * BigInt(2));
  return negative ? -q : q;
}

const qtyUnits = (q: number) => BigInt(Math.sign(q) * Math.round(Math.abs(q) * 1000) || 0);

/**
 * Средно претеглена цена след прибавяне на q2 бройки по c2 към q1 по c1 (q2 може да е отрицателно —
 * изписване по цена, различна от средната). До 4 знака; при нулево общо количество — c2.
 */
export function weightedAverage(q1: number, c1: number, q2: number, c2: number) {
  const qa = qtyUnits(q1);
  const qb = qtyUnits(q2);
  const total = qa + qb;
  if (total <= BigInt(0)) return roundMoney(c2, 4);
  const value = qa * BigInt(units(c1)) + qb * BigInt(units(c2)); // хилядни × десетохилядни
  return Number(bigDivRound(value, total)) / SCALE;
}

/** Единична цена от обща стойност и количество, до 4 знака (0 при нулево количество). */
export function unitCostOf(value: number, quantity: number) {
  const q = qtyUnits(quantity);
  if (q === BigInt(0)) return 0;
  // стойност в десетохилядни × 1000 / количество в хилядни → десетохилядни
  return Number(bigDivRound(BigInt(units(value)) * BigInt(1000), q)) / SCALE;
}
