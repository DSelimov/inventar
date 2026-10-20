"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { collectionItems, collections, items } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { int, optional, required, str } from "@/lib/forms";

async function own(orgId: number, id: number) {
  const c = await db.query.collections.findFirst({ where: and(eq(collections.id, id), eq(collections.organizationId, orgId)) });
  if (!c) throw new Error("Колекцията не е намерена.");
  return c;
}

export async function createCollection(fd: FormData) {
  const ctx = await requireContext("write");
  const name = required(str(fd, "name"), "Име");
  const [row] = await db
    .insert(collections)
    .values({ organizationId: ctx.org.id, name, description: optional(fd, "description"), color: str(fd, "color", "#0ea5e9") })
    .returning({ id: collections.id });
  await audit(ctx, "create", "collection", row.id, { name });
  revalidatePath("/collections");
  redirect(`/collections/${row.id}`);
}

export async function updateCollection(id: number, fd: FormData) {
  const ctx = await requireContext("write");
  await own(ctx.org.id, id);
  const name = required(str(fd, "name"), "Име");
  await db.update(collections).set({ name, description: optional(fd, "description"), color: str(fd, "color", "#0ea5e9") }).where(eq(collections.id, id));
  revalidatePath("/collections");
  revalidatePath(`/collections/${id}`);
}

export async function deleteCollection(id: number) {
  const ctx = await requireContext("delete");
  const c = await own(ctx.org.id, id);
  await db.delete(collections).where(eq(collections.id, id));
  await audit(ctx, "delete", "collection", id, { name: c.name });
  revalidatePath("/collections");
  redirect("/collections");
}

export async function addItemToCollection(collectionId: number, fd: FormData) {
  const ctx = await requireContext("write");
  await own(ctx.org.id, collectionId);
  const itemId = int(fd, "itemId", 0);
  const item = await db.query.items.findFirst({ where: and(eq(items.id, itemId), eq(items.organizationId, ctx.org.id)) });
  if (!item) throw new Error("Изберете артикул.");
  await db.insert(collectionItems).values({ collectionId, itemId }).onConflictDoNothing();
  revalidatePath(`/collections/${collectionId}`);
  revalidatePath(`/items/${itemId}`);
}

export async function removeItemFromCollection(collectionId: number, itemId: number) {
  const ctx = await requireContext("write");
  await own(ctx.org.id, collectionId);
  await db.delete(collectionItems).where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.itemId, itemId)));
  revalidatePath(`/collections/${collectionId}`);
  revalidatePath(`/items/${itemId}`);
}
