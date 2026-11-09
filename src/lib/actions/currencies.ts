"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { currencies } from "@/db/tenant-schema";
import { act } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { optional, str } from "@/lib/forms";
import { COMMON_CURRENCIES, fetchEcbRates, refreshFromEcb } from "@/lib/fx";

function readRate(raw: string) {
  const rate = Number(raw.replace(",", "."));
  if (!Number.isFinite(rate) || rate <= 0) throw new UserError("Курсът трябва да е положително число.");
  return Math.round(rate * 1e8) / 1e8;
}

export const addCurrency = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const code = str(fd, "code").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new UserError("Кодът е три латински букви (ISO 4217), напр. USD.");
  if (code === ctx.org.currency) throw new UserError("Това е основната валута на организацията.");
  const [exists] = await ctx.db.select().from(currencies).where(eq(currencies.code, code));
  if (exists) throw new UserError(`${code} вече е добавена.`);
  let rate: number;
  let source = "manual";
  const raw = optional(fd, "rate");
  if (raw) rate = readRate(raw);
  else {
    // без курс — от ЕЦБ
    const r = (await fetchEcbRates(ctx.org.currency)).rates.get(code);
    if (!r) throw new UserError(`ЕЦБ няма курс за ${code} — въведете го ръчно.`);
    rate = r;
    source = "ecb";
  }
  await ctx.db.insert(currencies).values({ code, name: optional(fd, "name") ?? COMMON_CURRENCIES[code] ?? code, rate, source });
  await audit(ctx, "create", "currency", null, { code, rate });
  revalidatePath("/settings/currencies");
  return `${code} е добавена (1 ${code} = ${rate} ${ctx.org.currency}).`;
});

export const updateCurrencyRate = act(async (code: string, fd: FormData) => {
  const ctx = await requireContext("manage");
  const rate = readRate(str(fd, "rate"));
  await ctx.db.update(currencies).set({ rate, source: "manual", updatedAt: new Date() }).where(eq(currencies.code, code));
  await audit(ctx, "update", "currency", null, { code, rate });
  revalidatePath("/settings/currencies");
  return "Курсът е запазен.";
});

/** Поръчките пазят свой курс — изтриването на валутата не ги променя. */
export const deleteCurrency = act(async (code: string) => {
  const ctx = await requireContext("manage");
  await ctx.db.delete(currencies).where(eq(currencies.code, code));
  await audit(ctx, "delete", "currency", null, { code });
  revalidatePath("/settings/currencies");
  return `${code} е премахната.`;
});

export const refreshCurrencyRates = act(async () => {
  const ctx = await requireContext("manage");
  const r = await refreshFromEcb(ctx.db, ctx.org.currency);
  await audit(ctx, "update", "currency", null, { ecb: r.date, updated: r.updated });
  revalidatePath("/settings/currencies");
  return r.updated.length ? `Обновени от ЕЦБ (${r.date}): ${r.updated.join(", ")}.` : "Няма валути с курс от ЕЦБ.";
});
