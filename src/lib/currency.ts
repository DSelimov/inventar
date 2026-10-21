/**
 * Валути. От 1 януари 2026 г. България е в еврозоната: левът е заменен по фиксирания курс
 * 1 EUR = 1.95583 BGN. Нови организации и смяна на валутата — само от списъка; BGN остава само за
 * организации отпреди прехода, докато не бъдат превалутирани (src/lib/euro.ts, pnpm db:euro).
 */

export const BGN_PER_EUR = 1.95583;

export const CURRENCIES = [
  { code: "EUR", label: "Евро (€)" },
  { code: "USD", label: "Щатски долар ($)" },
  { code: "GBP", label: "Британска лира (£)" },
  { code: "CHF", label: "Швейцарски франк" },
  { code: "RON", label: "Румънска лея" },
  { code: "TRY", label: "Турска лира" },
  { code: "RSD", label: "Сръбски динар" },
  { code: "MKD", label: "Македонски денар" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function isCurrency(code: string): code is CurrencyCode {
  return CURRENCIES.some((c) => c.code === code);
}

/**
 * Лева → евро, закръглено до decimals знака (половинката далеч от нулата), с цели числа —
 * без грешки от плаваща запетая. Сумата е с до 4 знака (decimal(14,4)).
 */
export function bgnToEur(bgn: number, decimals = 2) {
  const units = BigInt(Math.sign(bgn) * Math.round(Math.abs(bgn) * 10_000) || 0); // десетохилядни лева
  const rate = BigInt(195_583); // курсът × 100000
  // евро в 10^-decimals = лева(10^-4) × 10^5 / rate / 10^(4 − decimals)
  const divisor = rate * BigInt(10 ** (4 - decimals));
  const numerator = units * BigInt(100_000);
  const negative = numerator < BigInt(0);
  const abs = negative ? -numerator : numerator;
  const rounded = (abs * BigInt(2) + divisor) / (divisor * BigInt(2));
  return Number(negative ? -rounded : rounded) / 10 ** decimals;
}
