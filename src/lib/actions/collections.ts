"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { collectionItems, collections } from "@/db/schema";
import { int, optional, required, str } from "@/lib/forms";

export async function createCollection(fd: FormData) {
  const name = required(str(fd, "name"), "Име");
  const [row] = await db
    .insert(collections)
    .values({ name, description: optional(fd, "description"), color: str(fd, "color", "#0ea5e9") })
    .returning({ id: collections.id });
  revalidatePath("/collections");
  redirect(`/collections/${row.id}`);
}

export async function updateCollection(id: number, fd: FormData) {
  const name = required(str(fd, "name"), "Име");
  await db
    .update(collections)
    .set({ name, description: optional(fd, "description"), color: str(fd, "color", "#0ea5e9") })
    .where(eq(collections.id, id));
  revalidatePath("/collections");
  revalidatePath(`/collections/${id}`);
}

export async function deleteCollection(id: number) {
  await db.delete(collections).where(eq(collections.id, id));
  revalidatePath("/collections");
  redirect("/collections");
}

export async function addItemToCollection(collectionId: number, fd: FormData) {
  const itemId = int(fd, "itemId", 0);
  if (!itemId) throw new Error("Изберете артикул.");
  await db
    .insert(collectionItems)
    .values({ collectionId, itemId })
    .onConflictDoNothing();
  revalidatePath(`/collections/${collectionId}`);
  revalidatePath(`/items/${itemId}`);
}

export async function removeItemFromCollection(collectionId: number, itemId: number) {
  await db
    .delete(collectionItems)
    .where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.itemId, itemId)));
  revalidatePath(`/collections/${collectionId}`);
  revalidatePath(`/items/${itemId}`);
}
