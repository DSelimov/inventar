/**
 * Продажни цени: ценови групи, отстъпка на партньора и закръгляне при смяна на цените.
 * Без достъп до базата — ползва се и от формата за поръчка в браузъра.
 *
 * Правило (както в Microinvest Склад Pro): групата на партньора има предимство пред групата на
 * локацията; без група или без цена в групата — цената на дребно на артикула. Отстъпката на
 * партньора се прилага върху така намерената цена и резултатът се закръгля до стотинка.
 */
import { applyPercent, roundMoney } from "./money";
import { UserError } from "./errors";

export const PRICE_ROUNDINGS = ["0.01", "0.10", "0.50", "1", "0.99"] as const;
export type PriceRounding = (typeof PRICE_ROUNDINGS)[number];
export const ROUNDING_LABELS: Record<PriceRounding, string> = {
  "0.01": "до стотинка",
  "0.10": "до 10 стотинки",
  "0.50": "до 50 стотинки",
  "1": "до цяло число",
  "0.99": "да завършва на ,99",
};

/** Закръгляне на цена: едно закръгляне от десетохилядните (без двойно закръгляне и плаваща запетая). */
export function roundPrice(price: number, mode: PriceRounding = "0.01") {
  const u = Math.round(roundMoney(price, 4) * 10_000); // цели десетохилядни
  const step = { "0.01": 100, "0.10": 1_000, "0.50": 5_000, "1": 10_000, "0.99": 10_000 }[mode] ?? 100;
  // нагоре до цяло и минус стотинка: 10,20 → 10,99; 10,00 → 9,99
  const out = mode === "0.99" ? Math.max(9_900, Math.ceil(u / step) * step - 100) : Math.round(u / step) * step;
  return out / 10_000;
}

/** Ценовата група за продажба: на партньора, иначе на локацията. */
export function effectivePriceGroup(partnerGroupId?: number | null, locationGroupId?: number | null) {
  return partnerGroupId || locationGroupId || null;
}

/**
 * Продажна цена за ред: цената в групата (или на дребно) минус отстъпката на партньора.
 * Без отстъпка цената се връща точно както е записана (до 4 знака).
 */
export function salesPrice(input: { retail: number; groupPrice?: number | null; discountPercent?: number | null }) {
  const base = input.groupPrice ?? input.retail;
  const discount = input.discountPercent ?? 0;
  if (!discount) return base;
  return roundMoney(applyPercent(base, -discount), 2);
}

/** Процент (отстъпка, надценка) от формата: до 2 знака, в граници. */
export function parsePercent(raw: unknown, label = "Процент", { min = -100, max = 1000 } = {}) {
  if (raw === null || raw === undefined || raw === "") return 0;
  const value = Number(String(raw).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(value)) throw new UserError(`${label}: невалидно число.`);
  if (value < min || value > max) throw new UserError(`${label}: трябва да е между ${min} и ${max}.`);
  return Math.round(value * 100) / 100;
}
