"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { categories, fieldDefinitions, FIELD_TYPES } from "@/db/schema";
import { bool, int, oneOf, optional, required, str } from "@/lib/forms";

export async function createCategory(fd: FormData) {
  const name = required(str(fd, "name"), "Име");
  const [row] = await db
    .insert(categories)
    .values({ name, description: optional(fd, "description"), color: str(fd, "color", "#6366f1") })
    .returning({ id: categories.id });
  revalidatePath("/categories");
  redirect(`/categories/${row.id}`);
}

export async function updateCategory(id: number, fd: FormData) {
  const name = required(str(fd, "name"), "Име");
  await db
    .update(categories)
    .set({ name, description: optional(fd, "description"), color: str(fd, "color", "#6366f1") })
    .where(eq(categories.id, id));
  revalidatePath("/categories");
  revalidatePath(`/categories/${id}`);
}

export async function deleteCategory(id: number) {
  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/categories");
  revalidatePath("/items");
  redirect("/categories");
}

export async function addField(categoryId: number, fd: FormData) {
  const name = required(str(fd, "name"), "Име на полето");
  const type = oneOf(fd, "type", FIELD_TYPES, "text");
  const rawOptions = str(fd, "options");
  const options =
    type === "select"
      ? JSON.stringify(rawOptions.split(/[,\n]/).map((o) => o.trim()).filter(Boolean))
      : null;
  await db.insert(fieldDefinitions).values({
    categoryId,
    name,
    type,
    options,
    required: bool(fd, "required"),
    sortOrder: int(fd, "sortOrder", 0),
  });
  revalidatePath(`/categories/${categoryId}`);
}

export async function deleteField(categoryId: number, fieldId: number) {
  await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));
  revalidatePath(`/categories/${categoryId}`);
}
