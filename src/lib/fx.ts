import "server-only";
/**
 * Чуждестранни валути: курс към основната валута на организацията (колко основна валута е 1 единица),
 * ръчно или от дневните курсове на Европейската централна банка (база EUR).
 * Поръчка в чужда валута пази курса при създаването си; себестойността, салдата и маржът се смятат
 * в основната валута по този курс (convertMoney — точно, без плаваща запетая).
 */
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { currencies } from "@/db/tenant-schema";
import { BGN_PER_EUR as EUR_BGN } from "./currency";
import { UserError } from "./errors";
import { convertMoney } from "./money";

export const COMMON_CURRENCIES: Record<string, string> = {
  USD: "Щатски долар",
  GBP: "Британска лира",
  CHF: "Швейцарски франк",
  RON: "Румънска лея",
  TRY: "Турска лира",
  PLN: "Полска злота",
  CZK: "Чешка крона",
  HUF: "Унгарски форинт",
  RSD: "Сръбски динар",
  CNY: "Китайски юан",
  JPY: "Японска йена",
  EUR: "Евро",
  BGN: "Български лев",
};

export async function listCurrencies(db: Db) {
  return db.select().from(currencies).orderBy(asc(currencies.code));
}

/** Сума от поръчка/документ в основната валута (поръчка без валута — без промяна). */
export function toBase(amount: number, doc: { currency?: string | null; exchangeRate?: number | null }, decimals = 4) {
  if (!doc.currency || !doc.exchangeRate) return amount;
  return convertMoney(amount, doc.exchangeRate, decimals);
}

/** Валута и курс от формата: празно = основната; курсът по подразбиране е текущият. */
export async function readDocumentCurrency(db: Db, base: string, code: string | null, rateRaw: string | null) {
  const c = (code ?? "").trim().toUpperCase();
  if (!c || c === base) return { currency: null, exchangeRate: null };
  const [row] = await db.select().from(currencies).where(eq(currencies.code, c));
  if (!row) throw new UserError(`Валутата ${c} не е добавена (Настройки › Валути).`);
  const rate = rateRaw ? Number(rateRaw.replace(",", ".")) : row.rate;
  if (!Number.isFinite(rate) || rate <= 0) throw new UserError("Невалиден курс.");
  return { currency: c, exchangeRate: Math.round(rate * 1e8) / 1e8 };
}

const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** Дневните курсове на ЕЦБ, преобразувани към основната валута (EUR или BGN): код → основна за 1 единица. */
export async function fetchEcbRates(base: string, fetcher: typeof fetch = fetch) {
  if (base !== "EUR" && base !== "BGN") throw new UserError("Курсовете на ЕЦБ са за организации в евро или лева.");
  const res = await fetcher(ECB_URL, { headers: { Accept: "application/xml" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new UserError(`ЕЦБ не отговори (${res.status}).`);
  const xml = await res.text();
  const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1] ?? null;
  const perEur = new Map<string, number>([["EUR", 1]]); // 1 EUR = x единици
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) perEur.set(m[1], Number(m[2]));
  if (perEur.size < 2) throw new UserError("Неочакван отговор от ЕЦБ.");
  if (base === "BGN") perEur.set("BGN", EUR_BGN);
  const eurInBase = base === "EUR" ? 1 : EUR_BGN; // основна валута за 1 EUR
  const out = new Map<string, number>();
  for (const [code, x] of perEur) if (code !== base && x > 0) out.set(code, Math.round((eurInBase / x) * 1e8) / 1e8);
  return { date, rates: out };
}

/** Обновява курса на вече добавените валути от ЕЦБ. Връща обновените кодове. */
export async function refreshFromEcb(db: Db, base: string, fetcher?: typeof fetch) {
  const { date, rates } = await fetchEcbRates(base, fetcher);
  const updated: string[] = [];
  for (const c of await listCurrencies(db)) {
    const rate = rates.get(c.code);
    if (!rate) continue;
    await db.update(currencies).set({ rate, source: "ecb", updatedAt: new Date() }).where(eq(currencies.code, c.code));
    updated.push(c.code);
  }
  return { date, updated };
}
