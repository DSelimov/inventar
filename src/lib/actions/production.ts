"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PRODUCTION_KINDS, productions, recipes } from "@/db/tenant-schema";
import { act, redirectWith } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { assertLocationAccess } from "@/lib/stock";
import { UserError } from "@/lib/errors";
import { bool, int, oneOf, optional, required, str } from "@/lib/forms";
import { runProduction, saveRecipe } from "@/lib/production";
import { parseQuantity } from "@/lib/quantity";

function readRecipe(fd: FormData) {
  const itemIds = fd.getAll("lineItemId").map((v) => Number(v));
  const quantities = fd.getAll("lineQuantity").map(String);
  const lines = itemIds
    .map((itemId, i) => ({ itemId, quantity: parseQuantity(quantities[i], 3, `Ред ${i + 1}: количество`) }))
    .filter((l) => Number.isInteger(l.itemId) && l.itemId > 0);
  const itemId = int(fd, "itemId");
  if (!itemId) throw new UserError("Изберете какво се произвежда.");
  return {
    itemId,
    name: required(str(fd, "name"), "Име"),
    outputQuantity: parseQuantity(str(fd, "outputQuantity") || "1", 3, "Добив"),
    notes: optional(fd, "notes"),
    active: fd.has("active") ? bool(fd, "active") : true,
    lines,
  };
}

export const createRecipe = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const data = readRecipe(fd);
  const id = await saveRecipe(ctx.db, null, data);
  await audit(ctx, "create", "recipe", id, { name: data.name, lines: data.lines.length });
  revalidatePath("/production/recipes");
  return redirectWith(`/production/recipes/${id}`, "Рецептата е създадена.");
});

export const updateRecipe = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const data = readRecipe(fd);
  await saveRecipe(ctx.db, id, data);
  await audit(ctx, "update", "recipe", id, { name: data.name, lines: data.lines.length });
  revalidatePath("/production/recipes");
  revalidatePath(`/production/recipes/${id}`);
  return "Рецептата е запазена.";
});

export const deleteRecipe = act(async (id: number) => {
  const ctx = await requireContext("delete");
  const [used] = await ctx.db.select({ id: productions.id }).from(productions).where(eq(productions.recipeId, id)).limit(1);
  // протоколите пазят свои редове; рецептата с история само се деактивира
  if (used) await ctx.db.update(recipes).set({ active: false }).where(eq(recipes.id, id));
  else await ctx.db.delete(recipes).where(eq(recipes.id, id));
  await audit(ctx, used ? "update" : "delete", "recipe", id, used ? { active: false } : null);
  revalidatePath("/production/recipes");
  return redirectWith("/production/recipes", used ? "Рецептата има протоколи — деактивирана е." : "Рецептата е изтрита.");
});

export const runProductionAction = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const kind = oneOf(fd, "kind", PRODUCTION_KINDS, "assembly");
  assertLocationAccess(ctx.user, int(fd, "location"));
  const r = await runProduction(ctx.db, ctx.user, {
    recipeId: int(fd, "recipe"),
    kind,
    quantity: parseQuantity(str(fd, "quantity"), 3, "Количество"),
    locationId: int(fd, "location"),
    notes: optional(fd, "notes"),
  });
  await audit(ctx, "create", "production", r.id, { number: r.number, kind, totalCost: r.totalCost });
  revalidatePath("/production");
  revalidatePath("/items");
  return redirectWith(`/production/${r.id}`, `${kind === "assembly" ? "Произведено" : "Разглобено"} — протокол ${r.number}.`);
});
