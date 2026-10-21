import { lineTotal, sumMoney } from "./money";

/**
 * ДДС на ред: сумите се закръглят до стотинка на всеки ред (както в документите), а общо по ставка е
 * сумата на редовете. Цените се въвеждат без ДДС, или с ДДС при настройка pricesIncludeVat.
 * Модулът е и за клиентските компоненти (общо във формата на поръчката).
 */

export type LineAmounts = { net: number; vat: number; gross: number };

/** rate в проценти (20, 9, 0). */
export function lineAmounts(quantity: number, unitPrice: number, rate: number, pricesIncludeVat = false): LineAmounts {
  const total = lineTotal(quantity, unitPrice);
  if (!pricesIncludeVat) {
    const vat = lineTotal(total, rate / 100);
    return { net: total, vat, gross: sumMoney([total, vat]) };
  }
  const net = netFromGross(total, rate);
  return { net, vat: sumMoney([total, -net]), gross: total };
}

/** Данъчна основа от сума с ДДС, до стотинка (половинката далеч от нулата). */
export function netFromGross(gross: number, rate: number) {
  const cents = BigInt(Math.sign(gross) * Math.round(Math.abs(gross) * 100) || 0);
  const basis = BigInt(10_000 + Math.round(rate * 100)); // 1 + ставката, в базисни точки
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  const rounded = (abs * BigInt(10_000) * BigInt(2) + basis) / (basis * BigInt(2));
  return Number(negative ? -rounded : rounded) / 100;
}

export type VatSummaryRow = { rate: number; legalBasis: string | null; net: number; vat: number; gross: number };

/** Обобщение по ставка (за документи): основа, ДДС и общо за всяка ставка + общо. */
export function vatSummary(lines: Array<{ vatRate: number; netAmount: number; vatAmount: number; grossAmount: number; legalBasis?: string | null }>) {
  const byRate = new Map<string, VatSummaryRow>();
  for (const l of lines) {
    const key = `${l.vatRate}|${l.legalBasis ?? ""}`;
    const row = byRate.get(key) ?? { rate: l.vatRate, legalBasis: l.legalBasis ?? null, net: 0, vat: 0, gross: 0 };
    row.net = sumMoney([row.net, l.netAmount]);
    row.vat = sumMoney([row.vat, l.vatAmount]);
    row.gross = sumMoney([row.gross, l.grossAmount]);
    byRate.set(key, row);
  }
  const rows = [...byRate.values()].sort((a, b) => b.rate - a.rate);
  return { rows, net: sumMoney(rows.map((r) => r.net)), vat: sumMoney(rows.map((r) => r.vat)), gross: sumMoney(rows.map((r) => r.gross)) };
}

/** Редовете на поръчка със сумите им и обобщението по ставка. */
export function orderVat<L extends { quantity: number; unitPrice: number; vatRate: number; legalBasis?: string | null }>(order: { pricesIncludeVat: boolean }, lines: L[]) {
  const priced = lines.map((l) => {
    const a = lineAmounts(l.quantity, l.unitPrice, l.vatRate, order.pricesIncludeVat);
    return { ...l, netAmount: a.net, vatAmount: a.vat, grossAmount: a.gross };
  });
  return { lines: priced, ...vatSummary(priced) };
}
