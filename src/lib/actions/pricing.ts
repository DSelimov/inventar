"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { itemPrices, items, priceGroups } from "@/db/tenant-schema";
import { act, redirectWith } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { bool, int, required, str } from "@/lib/forms";
import { parseMoney } from "@/lib/money";
import { applyBulkPrices, readBulkParams, recordPriceChanges, type PriceChangeRow } from "@/lib/price-groups";

async function assertUniqueName(db: Parameters<typeof recordPriceChanges>[0], name: string, id?: number) {
  const existing = await db.query.priceGroups.findFirst({ where: eq(priceGroups.name, name) });
  if (existing && existing.id !== id) throw new UserError(`Вече има ценова група „${name}“.`);
}

export const createPriceGroup = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  await assertUniqueName(ctx.db, name);
  const [row] = await ctx.db.insert(priceGroups).values({ name, sortOrder: int(fd, "sortOrder") }).$returningId();
  await audit(ctx, "create", "price_group", row.id, { name });
  revalidatePath("/settings/prices");
  return "Ценовата група е създадена.";
});

export const updatePriceGroup = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  await assertUniqueName(ctx.db, name, id);
  await ctx.db.update(priceGroups).set({ name, sortOrder: int(fd, "sortOrder"), active: bool(fd, "active") }).where(eq(priceGroups.id, id));
  await audit(ctx, "update", "price_group", id, { name });
  revalidatePath("/settings/prices");
  return "Ценовата група е запазена.";
});

export const deletePriceGroup = act(async (id: number) => {
  const ctx = await requireContext("manage");
  const group = await ctx.db.query.priceGroups.findFirst({ where: eq(priceGroups.id, id) });
  if (!group) throw new UserError("Ценовата група не е намерена.");
  // цените в групата се изтриват (cascade), партньорите и локациите минават на цена на дребно (set null)
  await ctx.db.delete(priceGroups).where(eq(priceGroups.id, id));
  await audit(ctx, "delete", "price_group", id, { name: group.name });
  revalidatePath("/settings/prices");
  return "Ценовата група е изтрита.";
});

/** Цените на един артикул по групи: поле price_<id>; празно поле = без цена (дребно). */
export const saveItemGroupPrices = act(async (itemId: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const item = await ctx.db.query.items.findFirst({ where: eq(items.id, itemId) });
  if (!item) throw new UserError("Артикулът не е намерен.");
  const groups = await ctx.db.query.priceGroups.findMany();
  const current = await ctx.db.select().from(itemPrices).where(eq(itemPrices.itemId, itemId));
  const changes: PriceChangeRow[] = [];
  await ctx.db.transaction(async (tx) => {
    for (const g of groups) {
      if (!fd.has(`price_${g.id}`)) continue;
      const price = parseMoney(str(fd, `price_${g.id}`), g.name, null);
      const old = current.find((c) => c.priceGroupId === g.id)?.price ?? null;
      if (price === old) continue;
      if (price === null) await tx.delete(itemPrices).where(and(eq(itemPrices.itemId, itemId), eq(itemPrices.priceGroupId, g.id)));
      else await tx.insert(itemPrices).values({ itemId, priceGroupId: g.id, price }).onDuplicateKeyUpdate({ set: { price } });
      changes.push({ itemId, target: "group", priceGroupId: g.id, oldPrice: old, newPrice: price });
    }
    await recordPriceChanges(tx, ctx.user, "Цени по групи", changes);
  });
  if (changes.length) await audit(ctx, "update", "item_prices", itemId, { name: item.name, changes: changes.length });
  revalidatePath(`/items/${itemId}`);
  return changes.length ? "Цените са запазени." : "Няма промени.";
});

/** „Смяна на цени“: прилага същото изчисление като прегледа на /items/prices. */
export const bulkChangePrices = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const params = readBulkParams((k) => (fd.has(k) ? str(fd, k) : undefined));
  const count = await applyBulkPrices(ctx.db, ctx.user, params);
  await audit(ctx, "update", "prices_bulk", null, { ...params, count });
  revalidatePath("/items");
  return redirectWith("/items/prices", count ? `Променени цени: ${count}.` : "Няма цени за промяна.");
});
