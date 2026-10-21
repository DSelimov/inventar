"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { itemUnits, items } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { optional, required, str } from "@/lib/forms";
import { assertQuantity, itemDecimals, parseQuantity, MAX_DECIMALS } from "@/lib/quantity";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";

/** Нова опаковка: име, колко основни единици съдържа и баркод (уникален сред артикулите и опаковките). */
export const addItemUnit = act(async (itemId: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const [item] = await ctx.db.select().from(items).where(eq(items.id, itemId));
  if (!item) throw new UserError("Артикулът не е намерен.");
  const name = required(str(fd, "name"), "Име на опаковката").slice(0, 64);
  const factor = parseQuantity(str(fd, "factor"), MAX_DECIMALS, "Брой в опаковката");
  if (factor <= 0) throw new UserError("Опаковката съдържа поне една единица.");
  assertQuantity(factor, itemDecimals(item), `„${item.name}“: брой в опаковката`);
  const barcode = optional(fd, "barcode");
  if (barcode) {
    const [asItem] = await ctx.db.select({ id: items.id }).from(items).where(eq(items.barcode, barcode));
    const [asUnit] = await ctx.db.select({ id: itemUnits.id }).from(itemUnits).where(eq(itemUnits.barcode, barcode));
    if (asItem || asUnit) throw new UserError(`Баркод ${barcode} вече се използва.`);
  }
  await ctx.db.insert(itemUnits).values({ itemId, name, factor, barcode });
  await audit(ctx, "update", "item", itemId, { packUnit: name, factor, barcode });
  revalidatePath(`/items/${itemId}`);
  return `Опаковката „${name}“ е добавена.`;
});

export const removeItemUnit = act(async (id: number) => {
  const ctx = await requireContext("write");
  const [unit] = await ctx.db.select().from(itemUnits).where(eq(itemUnits.id, id));
  if (!unit) throw new UserError("Опаковката не е намерена.");
  await ctx.db.delete(itemUnits).where(eq(itemUnits.id, id));
  await audit(ctx, "update", "item", unit.itemId, { packUnitRemoved: unit.name });
  revalidatePath(`/items/${unit.itemId}`);
  return "Опаковката е премахната.";
});
