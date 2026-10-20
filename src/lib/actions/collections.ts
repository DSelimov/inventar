"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { collectionItems, collections, items } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { int, optional, required, str } from "@/lib/forms";
import { act, redirectWith } from "@/lib/action";
import { UserError } from "@/lib/errors";

export const createCollection = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const name = required(str(fd, "name"), "Име");
  const [row] = await ctx.db.insert(collections).values({ name, description: optional(fd, "description"), color: str(fd, "color", "#0ea5e9") }).$returningId();
  await audit(ctx, "create", "collection", row.id, { name });
  revalidatePath("/collections");
  return redirectWith(`/collections/${row.id}`, "Колекцията е създадена.");
});

export const updateCollection = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const name = required(str(fd, "name"), "Име");
  await ctx.db.update(collections).set({ name, description: optional(fd, "description"), color: str(fd, "color", "#0ea5e9") }).where(eq(collections.id, id));
  revalidatePath("/collections");
  revalidatePath(`/collections/${id}`);
  return "Колекцията е запазена.";
});

export const deleteCollection = act(async (id: number) => {
  const ctx = await requireContext("delete");
  const c = await ctx.db.query.collections.findFirst({ where: eq(collections.id, id) });
  if (!c) throw new UserError("Колекцията не е намерена.");
  await ctx.db.delete(collections).where(eq(collections.id, id));
  await audit(ctx, "delete", "collection", id, { name: c.name });
  revalidatePath("/collections");
  return redirectWith("/collections", "Колекцията е изтрита.");
});

export const addItemToCollection = act(async (collectionId: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const itemId = int(fd, "itemId", 0);
  const item = await ctx.db.query.items.findFirst({ where: eq(items.id, itemId) });
  if (!item) throw new UserError("Изберете артикул.");
  await ctx.db.insert(collectionItems).values({ collectionId, itemId }).onDuplicateKeyUpdate({ set: { itemId: sql`item_id` } });
  revalidatePath(`/collections/${collectionId}`);
  revalidatePath(`/items/${itemId}`);
  return "Артикулът е добавен в колекцията.";
});

export const removeItemFromCollection = act(async (collectionId: number, itemId: number) => {
  const ctx = await requireContext("write");
  await ctx.db.delete(collectionItems).where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.itemId, itemId)));
  revalidatePath(`/collections/${collectionId}`);
  revalidatePath(`/items/${itemId}`);
  return "Артикулът е премахнат от колекцията.";
});
