import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { categories, items, vatRates, type VatRate } from "@/db/tenant-schema";
import { UserError } from "./errors";

/** Ставката по подразбиране (първата активна, ако никоя не е отбелязана). */
export async function defaultVatRate(db: Db): Promise<VatRate | null> {
  const rates = await db.select().from(vatRates).where(eq(vatRates.active, true)).orderBy(asc(vatRates.sortOrder));
  return rates.find((r) => r.isDefault) ?? rates[0] ?? null;
}

/**
 * ДДС за редове: избраната ставка (трябва да е активна), иначе на артикула, на категорията му или по
 * подразбиране. Връща идентификатора и процента (снимка за документа).
 */
export async function assignVat<L extends { itemId: number; vatRateId?: number | null }>(db: Db, lines: L[]) {
  const rates = await db.select().from(vatRates);
  const byId = new Map(rates.map((r) => [r.id, r]));
  const fallback = rates.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder).find((r) => r.isDefault) ?? rates.find((r) => r.active) ?? null;
  const ids = [...new Set(lines.map((l) => l.itemId))];
  const itemRates = ids.length
    ? await db.select({ id: items.id, own: items.vatRateId, category: categories.vatRateId }).from(items).leftJoin(categories, eq(categories.id, items.categoryId)).where(inArray(items.id, ids))
    : [];
  const itemRate = new Map(itemRates.map((r) => [r.id, r.own ?? r.category]));
  return lines.map((l) => {
    let rate = l.vatRateId ? byId.get(l.vatRateId) : undefined;
    if (l.vatRateId && (!rate || !rate.active)) throw new UserError("Избраната ставка ДДС не съществува или е неактивна.");
    rate ??= byId.get(itemRate.get(l.itemId) ?? -1) ?? fallback ?? undefined;
    if (!rate) throw new UserError("Няма активна ставка ДДС — добавете в Настройки › ДДС.");
    return { ...l, vatRateId: rate.id, vatRate: rate.rate };
  });
}
