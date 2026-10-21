"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { controlDb } from "@/db/control";
import { organizations } from "@/db/control-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { bool, int, str } from "@/lib/forms";
import { COMPANY_FIELDS, setSetting } from "@/lib/settings";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";

export const saveOrganization = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const name = str(fd, "name") || ctx.org.name;
  const currency = (str(fd, "currency") || "EUR").toUpperCase().slice(0, 3);
  await controlDb.update(organizations).set({ name, currency }).where(eq(organizations.id, ctx.org.id));
  await setSetting(ctx.db, "lowStockAlerts", String(bool(fd, "lowStockAlerts")));
  await audit(ctx, "update", "organization", ctx.org.id, { name, currency });
  revalidatePath("/", "layout");
  return "Настройките са запазени.";
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
