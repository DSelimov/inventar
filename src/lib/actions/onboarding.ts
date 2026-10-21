"use server";

import { revalidatePath } from "next/cache";
import { act, redirectWith } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { optional } from "@/lib/forms";
import { dismissOnboarding, loadDemoData, quickStart, removeDemoData, type QuickItem } from "@/lib/onboarding";
import { slugSku } from "@/lib/utils";
import { parseMoney } from "@/lib/money";

const revalidate = () => {
  revalidatePath("/", "layout");
};

/** Бърз старт: редове name_i, qty_i, unit_i, price_i. Празните редове се пропускат. */
export const quickStartItems = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const rows: QuickItem[] = [];
  for (let i = 0; i < 10; i++) {
    const name = String(fd.get(`name_${i}`) ?? "").trim();
    if (!name) continue;
    const quantity = Math.trunc(Number(fd.get(`qty_${i}`) || 0));
    const unitPrice = parseMoney(fd.get(`price_${i}`), `Ред ${i + 1}: цена`);
    if (!Number.isInteger(quantity) || quantity < 0) throw new UserError(`Ред ${i + 1}: невалидно количество.`);
    rows.push({ name, quantity, unitPrice, unit: String(fd.get(`unit_${i}`) || "бр.").trim() || "бр." });
  }
  const r = await quickStart(ctx.db, ctx.user, { category: optional(fd, "category"), items: rows }, slugSku);
  await audit(ctx, "create", "item", null, { quickStart: r.ids.length });
  revalidate();
  return redirectWith("/items", `Добавени са ${r.ids.length} артикула. Следваща стъпка: поканете колега или отпечатайте етикети.`);
});

export const loadDemo = act(async () => {
  const ctx = await requireContext("manage");
  const r = await loadDemoData(ctx.db, ctx.user);
  await audit(ctx, "import", "item", null, { demo: r.items });
  revalidate();
  return redirectWith("/", `Заредени са ${r.items} примерни артикула, поръчка и партньори. Изтривате ги от „Първи стъпки“.`);
});

export const removeDemo = act(async () => {
  const ctx = await requireContext("manage");
  await removeDemoData(ctx.db);
  await audit(ctx, "delete", "item", null, { demo: "removed" });
  revalidate();
  return "Демо данните са изтрити.";
});

export const hideOnboarding = act(async () => {
  const ctx = await requireContext("manage");
  await dismissOnboarding(ctx.db);
  revalidate();
  return "Първите стъпки са скрити от таблото (остават в /onboarding).";
});
