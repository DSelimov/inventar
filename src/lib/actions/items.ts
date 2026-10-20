"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Db } from "@/db/tenant";
import { fieldDefinitions, itemFieldValues, items, ITEM_STATUSES, TRACKING_MODES, type MovementType } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { deleteItemFiles } from "@/lib/item-images";
import { int, num, oneOf, optional, optionalInt, required, str } from "@/lib/forms";
import { getDefaultLocation } from "@/lib/queries";
import { applyMovement, transferStock } from "@/lib/stock";
import { slugSku } from "@/lib/utils";
import { emit } from "@/lib/webhooks";

function revalidateItems(id?: number) {
  revalidatePath("/");
  revalidatePath("/items");
  revalidatePath("/reports");
  if (id) revalidatePath(`/items/${id}`);
}

async function saveFieldValues(db: Db, itemId: number, categoryId: number | null, fd: FormData) {
  await db.delete(itemFieldValues).where(eq(itemFieldValues.itemId, itemId));
  if (!categoryId) return;
  const defs = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.categoryId, categoryId));
  const values = defs
    .map((def) => {
      const raw = fd.get(`field_${def.id}`);
      let value = typeof raw === "string" ? raw.trim() : "";
      if (def.type === "boolean") value = raw === "on" || raw === "true" ? "true" : "false";
      if (def.required && def.type !== "boolean" && value === "") throw new Error(`Полето „${def.name}“ е задължително.`);
      return { itemId, fieldId: def.id, value };
    })
    .filter((v) => v.value !== "");
  if (values.length) await db.insert(itemFieldValues).values(values);
}

function readItem(fd: FormData) {
  const name = required(str(fd, "name"), "Име");
  return {
    name,
    sku: str(fd, "sku") || slugSku(name),
    barcode: optional(fd, "barcode"),
    description: optional(fd, "description"),
    categoryId: optionalInt(fd, "categoryId"),
    tracking: oneOf(fd, "tracking", TRACKING_MODES, "none"),
    minQuantity: Math.max(0, int(fd, "minQuantity", 0)),
    unit: str(fd, "unit", "бр.") || "бр.",
    unitCost: Math.max(0, num(fd, "unitCost", 0)),
    unitPrice: Math.max(0, num(fd, "unitPrice", 0)),
    status: oneOf(fd, "status", ITEM_STATUSES, "active"),
    variantLabel: optional(fd, "variantLabel"),
  };
}

async function assertUniqueSku(db: Db, sku: string, exceptId?: number) {
  const dup = await db.query.items.findFirst({ where: eq(items.sku, sku) });
  if (dup && dup.id !== exceptId) throw new Error(`Вече има артикул с код „${sku}“.`);
}

export async function createItem(fd: FormData) {
  const ctx = await requireContext("write");
  const data = readItem(fd);
  await assertUniqueSku(ctx.db, data.sku);
  const parentId = optionalInt(fd, "parentId");
  const quantity = Math.max(0, int(fd, "quantity", 0));
  const locationId = optionalInt(fd, "locationId") ?? (await getDefaultLocation(ctx.db))?.id ?? null;
  const lotNumber = optional(fd, "lotNumber");
  const expiryDate = optional(fd, "expiryDate");

  const id = await ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(items).values({ ...data, parentId }).$returningId();
    if (quantity > 0) {
      if (!locationId) throw new Error("Създайте първо локация (Настройки › Локации).");
      await applyMovement(tx, {
        actor: ctx.user,
        itemId: row.id,
        locationId,
        type: "in",
        quantity,
        reason: "Начална наличност",
        lot: data.tracking !== "none" ? { lotNumber: lotNumber ?? "", expiryDate } : null,
      });
    }
    return row.id;
  });
  await saveFieldValues(ctx.db, id, data.categoryId, fd);
  await audit(ctx, "create", "item", id, { name: data.name, sku: data.sku });
  emit(ctx.db, "item.created", { id, ...data });
  revalidateItems(id);
  redirect(`/items/${id}`);
}

export async function updateItem(id: number, fd: FormData) {
  const ctx = await requireContext("write");
  const data = readItem(fd);
  await assertUniqueSku(ctx.db, data.sku, id);
  const existing = await ctx.db.query.items.findFirst({ where: eq(items.id, id) });
  if (!existing) throw new Error("Артикулът не е намерен.");
  if (existing.tracking !== data.tracking && existing.quantity > 0) throw new Error("Режимът на проследяване може да се смени само при нулева наличност.");
  await ctx.db.update(items).set({ ...data, updatedAt: new Date() }).where(eq(items.id, id));
  await saveFieldValues(ctx.db, id, data.categoryId, fd);
  await audit(ctx, "update", "item", id, { name: data.name });
  emit(ctx.db, "item.updated", { id, ...data });
  revalidateItems(id);
  redirect(`/items/${id}`);
}

export async function deleteItem(id: number) {
  const ctx = await requireContext("delete");
  const existing = await ctx.db.query.items.findFirst({ where: eq(items.id, id) });
  if (!existing) throw new Error("Артикулът не е намерен.");
  await ctx.db.delete(items).where(eq(items.id, id));
  await deleteItemFiles(ctx.org, id);
  await audit(ctx, "delete", "item", id, { name: existing.name, sku: existing.sku });
  revalidateItems();
  redirect("/items");
}

export async function createVariant(parentId: number, fd: FormData) {
  const ctx = await requireContext("write");
  const parent = await ctx.db.query.items.findFirst({ where: eq(items.id, parentId) });
  if (!parent) throw new Error("Артикулът не е намерен.");
  const variantLabel = required(str(fd, "variantLabel"), "Вариант");
  const sku = str(fd, "sku") || `${parent.sku}-${variantLabel.toUpperCase().replace(/[^A-ZА-Я0-9]+/gi, "").slice(0, 8)}`;
  await assertUniqueSku(ctx.db, sku);
  const [row] = await ctx.db
    .insert(items)
    .values({
      parentId: parent.id,
      variantLabel,
      sku,
      barcode: optional(fd, "barcode"),
      name: parent.name,
      description: parent.description,
      categoryId: parent.categoryId,
      tracking: parent.tracking,
      minQuantity: parent.minQuantity,
      unit: parent.unit,
      unitCost: num(fd, "unitCost", parent.unitCost),
      unitPrice: num(fd, "unitPrice", parent.unitPrice),
    })
    .$returningId();
  const values = await ctx.db.select().from(itemFieldValues).where(eq(itemFieldValues.itemId, parent.id));
  if (values.length) await ctx.db.insert(itemFieldValues).values(values.map((v) => ({ ...v, itemId: row.id })));
  await audit(ctx, "create", "item", row.id, { name: parent.name, variant: variantLabel });
  revalidateItems(parent.id);
  redirect(`/items/${row.id}`);
}

export async function adjustStock(itemId: number, fd: FormData) {
  const ctx = await requireContext("write");
  const type = oneOf(fd, "type", ["in", "out", "adjust"] as const, "in") as MovementType;
  const quantity = int(fd, "quantity", 0);
  const locationId = int(fd, "locationId", 0) || (await getDefaultLocation(ctx.db))?.id;
  if (!locationId) throw new Error("Изберете локация.");
  if (quantity < 0 || (type !== "adjust" && quantity === 0)) throw new Error("Въведете валидно количество.");
  const lotId = optionalInt(fd, "lotId");
  const lotNumber = optional(fd, "lotNumber");
  const lot = type === "out" ? (lotId ? { lotId } : null) : lotNumber ? { lotNumber, expiryDate: optional(fd, "expiryDate") } : null;
  await ctx.db.transaction((tx) => applyMovement(tx, { actor: ctx.user, itemId, locationId, type, quantity, reason: optional(fd, "reason"), lot }));
  await audit(ctx, "movement", "item", itemId, { type, quantity, locationId });
  revalidateItems(itemId);
  const back = optional(fd, "redirectTo");
  if (back?.startsWith("/")) redirect(back);
}

export async function transfer(itemId: number, fd: FormData) {
  const ctx = await requireContext("write");
  const quantity = int(fd, "quantity", 0);
  if (quantity <= 0) throw new Error("Въведете валидно количество.");
  await transferStock(ctx.db, {
    actor: ctx.user,
    itemId,
    fromLocationId: int(fd, "fromLocationId", 0),
    toLocationId: int(fd, "toLocationId", 0),
    quantity,
    lotId: optionalInt(fd, "lotId"),
    reason: optional(fd, "reason"),
  });
  await audit(ctx, "transfer", "item", itemId, { quantity });
  revalidateItems(itemId);
}

export { and };
