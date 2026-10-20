"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { categories, fieldDefinitions, FIELD_TYPES } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { bool, int, oneOf, optional, required, str } from "@/lib/forms";

async function own(orgId: number, id: number) {
  const c = await db.query.categories.findFirst({ where: and(eq(categories.id, id), eq(categories.organizationId, orgId)) });
  if (!c) throw new Error("Категорията не е намерена.");
  return c;
}

export async function createCategory(fd: FormData) {
  const ctx = await requireContext("write");
  const name = required(str(fd, "name"), "Име");
  const [row] = await db
    .insert(categories)
    .values({ organizationId: ctx.org.id, name, description: optional(fd, "description"), color: str(fd, "color", "#6366f1") })
    .returning({ id: categories.id });
  await audit(ctx, "create", "category", row.id, { name });
  revalidatePath("/categories");
  redirect(`/categories/${row.id}`);
}

export async function updateCategory(id: number, fd: FormData) {
  const ctx = await requireContext("write");
  await own(ctx.org.id, id);
  const name = required(str(fd, "name"), "Име");
  await db.update(categories).set({ name, description: optional(fd, "description"), color: str(fd, "color", "#6366f1") }).where(eq(categories.id, id));
  await audit(ctx, "update", "category", id, { name });
  revalidatePath("/categories");
  revalidatePath(`/categories/${id}`);
}

export async function deleteCategory(id: number) {
  const ctx = await requireContext("delete");
  const c = await own(ctx.org.id, id);
  await db.delete(categories).where(eq(categories.id, id));
  await audit(ctx, "delete", "category", id, { name: c.name });
  revalidatePath("/categories");
  revalidatePath("/items");
  redirect("/categories");
}

export async function addField(categoryId: number, fd: FormData) {
  const ctx = await requireContext("manage");
  await own(ctx.org.id, categoryId);
  const name = required(str(fd, "name"), "Име на полето");
  const type = oneOf(fd, "type", FIELD_TYPES, "text");
  const rawOptions = str(fd, "options");
  const options = type === "select" ? JSON.stringify(rawOptions.split(/[,\n]/).map((o) => o.trim()).filter(Boolean)) : null;
  await db.insert(fieldDefinitions).values({ categoryId, name, type, options, required: bool(fd, "required"), sortOrder: int(fd, "sortOrder", 0) });
  await audit(ctx, "create", "field", categoryId, { name, type });
  revalidatePath(`/categories/${categoryId}`);
}

export async function deleteField(categoryId: number, fieldId: number) {
  const ctx = await requireContext("manage");
  await own(ctx.org.id, categoryId);
  await db.delete(fieldDefinitions).where(and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.categoryId, categoryId)));
  await audit(ctx, "delete", "field", fieldId);
  revalidatePath(`/categories/${categoryId}`);
}
