"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { vatRates } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { bool, int, optional, required, str } from "@/lib/forms";
import { setSetting } from "@/lib/settings";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";

function readRate(fd: FormData) {
  const rate = Number(str(fd, "rate").replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || Math.round(rate * 100) !== rate * 100) throw new UserError("Ставката е процент от 0 до 100, до 2 знака.");
  const legalBasis = optional(fd, "legalBasis");
  if (rate === 0 && !legalBasis) throw new UserError("При 0 % е нужно основание за неначисляване (напр. „чл. 113, ал. 9 от ЗДДС“).");
  return { name: required(str(fd, "name"), "Име"), rate, legalBasis, sortOrder: int(fd, "sortOrder", 0) };
}

function revalidate() {
  revalidatePath("/settings/vat");
  revalidatePath("/orders");
}

export const createVatRate = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const data = readRate(fd);
  const [row] = await ctx.db.insert(vatRates).values(data).$returningId();
  await audit(ctx, "create", "vat_rate", row.id, data);
  revalidate();
  return "Ставката е добавена.";
});

/** Ставката по документите е снимка (order_lines.vat_rate): промяната важи само за новите редове. */
export const updateVatRate = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("manage");
  const data = readRate(fd);
  const active = bool(fd, "active");
  const [current] = await ctx.db.select().from(vatRates).where(eq(vatRates.id, id));
  if (!current) throw new UserError("Ставката не е намерена.");
  if (current.isDefault && !active) throw new UserError("Ставката по подразбиране не може да е неактивна — първо изберете друга.");
  await ctx.db.update(vatRates).set({ ...data, active }).where(eq(vatRates.id, id));
  await audit(ctx, "update", "vat_rate", id, { ...data, active });
  revalidate();
  return "Ставката е запазена.";
});

export const setDefaultVatRate = act(async (id: number) => {
  const ctx = await requireContext("manage");
  await ctx.db.transaction(async (tx) => {
    await tx.update(vatRates).set({ isDefault: false });
    await tx.update(vatRates).set({ isDefault: true, active: true }).where(eq(vatRates.id, id));
  });
  await audit(ctx, "update", "vat_rate", id, { isDefault: true });
  revalidate();
  return "Ставката по подразбиране е сменена.";
});

export const savePricesIncludeVat = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const value = bool(fd, "pricesIncludeVat");
  await setSetting(ctx.db, "pricesIncludeVat", String(value));
  await audit(ctx, "update", "settings", null, { pricesIncludeVat: value });
  revalidate();
  return value ? "Цените в новите поръчки се въвеждат с ДДС." : "Цените в новите поръчки се въвеждат без ДДС.";
});
