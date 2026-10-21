"use server";

import { revalidatePath } from "next/cache";
import { controlDb } from "@/db/control";
import { organizations } from "@/db/control-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { bool, int, oneOf, str } from "@/lib/forms";
import { COMPANY_FIELDS, setSetting } from "@/lib/settings";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { count, eq, ne, or } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { items, orders, stockMovements } from "@/db/tenant-schema";
import { isCurrency } from "@/lib/currency";
import { convertTenantToEuro } from "@/lib/euro";
import { getValuationMethod, VALUATION_KEY, VALUATION_METHODS } from "@/lib/valuation";

export const saveOrganization = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const name = str(fd, "name") || ctx.org.name;
  const currency = str(fd, "currency").toUpperCase() || ctx.org.currency;
  if (currency !== ctx.org.currency) {
    if (!isCurrency(currency)) throw new UserError("Изберете валута от списъка.");
    // смяната само преименува сумите — позволена е само преди да има цени или поръчки
    if (await hasAmounts(ctx.db)) throw new UserError("Валутата не може да се смени, след като има цени или поръчки: сумите няма да бъдат преизчислени.");
  }
  const method = oneOf(fd, "valuationMethod", VALUATION_METHODS, await getValuationMethod(ctx.db));
  if (method !== (await getValuationMethod(ctx.db))) {
    // методът важи за цялата история: смяна само преди първото движение
    const [moved] = await ctx.db.select({ n: count() }).from(stockMovements);
    if (moved.n) throw new UserError("Методът на оценка се избира преди първото складово движение и после не се сменя.");
    await setSetting(ctx.db, VALUATION_KEY, method);
  }
  await controlDb.update(organizations).set({ name, currency }).where(eq(organizations.id, ctx.org.id));
  await setSetting(ctx.db, "lowStockAlerts", String(bool(fd, "lowStockAlerts")));
  await audit(ctx, "update", "organization", ctx.org.id, { name, currency, valuationMethod: method });
  revalidatePath("/", "layout");
  return "Настройките са запазени.";
});

async function hasAmounts(db: Db) {
  const [[priced], [ordered]] = await Promise.all([
    db.select({ n: count() }).from(items).where(or(ne(items.unitCost, 0), ne(items.unitPrice, 0))),
    db.select({ n: count() }).from(orders),
  ]);
  return priced.n + ordered.n > 0;
}

/** Лева → евро по фиксирания курс (само собственикът; виж src/lib/euro.ts). */
export const convertToEuro = act(async () => {
  const ctx = await requireContext("owner");
  if (ctx.org.currency !== "BGN") throw new UserError("Организацията вече не е в лева.");
  const r = await convertTenantToEuro(ctx.org, { id: ctx.user.id, name: ctx.user.name });
  revalidatePath("/", "layout");
  if (r.status === "already") return "Организацията вече е превалутирана.";
  return `Превалутирано в евро: ${r.items} артикула и ${r.orderLines} реда в ${r.orders} поръчки (курс 1.95583).`;
});

export const saveReportParameters = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const params = {
    windowDays: int(fd, "windowDays", 30),
    deadStockDays: int(fd, "deadStockDays", 90),
    leadTimeDays: int(fd, "leadTimeDays", 7),
    safetyDays: int(fd, "safetyDays", 7),
    targetMarginPct: int(fd, "targetMarginPct", 30),
  };
  for (const [key, value] of Object.entries(params)) {
    if (value <= 0) throw new UserError("Всички параметри трябва да са положителни числа.");
    await setSetting(ctx.db, key, String(value));
  }
  await audit(ctx, "update", "settings", null, params);
  revalidatePath("/reports");
  revalidatePath("/settings");
  return "Параметрите на отчетите са запазени.";
});

export const saveCompanyDetails = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const details = Object.fromEntries(COMPANY_FIELDS.map((k) => [k, str(fd, k).slice(0, 300)]));
  if (details.eik && !/^\d{9}(\d{4})?$/.test(details.eik)) throw new UserError("ЕИК трябва да е 9 или 13 цифри.");
  for (const [k, v] of Object.entries(details)) await setSetting(ctx.db, `company.${k}`, v);
  await audit(ctx, "update", "settings", null, { company: details.legalName });
  revalidatePath("/settings");
  return "Данните за документите са запазени.";
});
