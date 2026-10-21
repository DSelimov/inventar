"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { itemSuppliers, items, partners } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { bool, int, optional, optionalInt, str } from "@/lib/forms";
import { parseMoney } from "@/lib/money";
import { itemDecimals, parseQuantity } from "@/lib/quantity";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";

/** Добавя или обновява доставчик на артикула (по двойката артикул–партньор). */
export const saveItemSupplier = act(async (itemId: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const partnerId = int(fd, "partnerId", 0);
  const [item] = await ctx.db.select().from(items).where(eq(items.id, itemId));
  const [partner] = await ctx.db.select().from(partners).where(eq(partners.id, partnerId));
  if (!item) throw new UserError("Артикулът не е намерен.");
  if (!partner || partner.type === "customer") throw new UserError("Изберете доставчик.");
  const values = {
    supplierSku: optional(fd, "supplierSku"),
    purchasePrice: parseMoney(str(fd, "purchasePrice"), "Цена при доставчика", null),
    minOrderQuantity: parseQuantity(str(fd, "minOrderQuantity"), itemDecimals(item), "Минимално количество", 0) || null,
    leadTimeDays: optionalInt(fd, "leadTimeDays"),
    preferred: bool(fd, "preferred"),
  };
  await ctx.db.transaction(async (tx) => {
    await tx.insert(itemSuppliers).values({ itemId, partnerId, ...values }).onDuplicateKeyUpdate({ set: values });
    // един предпочитан доставчик на артикул
    if (values.preferred) await tx.update(itemSuppliers).set({ preferred: false }).where(and(eq(itemSuppliers.itemId, itemId), ne(itemSuppliers.partnerId, partnerId)));
  });
  await audit(ctx, "update", "item", itemId, { supplier: partner.name, ...values });
  revalidatePath(`/items/${itemId}`);
  return `Доставчикът „${partner.name}“ е запазен.`;
});

export const removeItemSupplier = act(async (id: number) => {
  const ctx = await requireContext("write");
  const [row] = await ctx.db.select().from(itemSuppliers).where(eq(itemSuppliers.id, id));
  if (!row) throw new UserError("Записът не е намерен.");
  await ctx.db.delete(itemSuppliers).where(eq(itemSuppliers.id, id));
  await audit(ctx, "update", "item", row.itemId, { supplierRemoved: row.partnerId });
  revalidatePath(`/items/${row.itemId}`);
  return "Доставчикът е премахнат от артикула.";
});
