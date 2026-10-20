"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  fieldDefinitions,
  itemFieldValues,
  items,
  ITEM_STATUSES,
  MOVEMENT_TYPES,
  stockMovements,
  type MovementType,
} from "@/db/schema";
import { int, num, oneOf, optional, optionalInt, required, str } from "@/lib/forms";
import { slugSku } from "@/lib/utils";

function revalidateItems(id?: number) {
  revalidatePath("/");
  revalidatePath("/items");
  if (id) revalidatePath(`/items/${id}`);
}

async function saveFieldValues(itemId: number, categoryId: number | null, fd: FormData) {
  await db.delete(itemFieldValues).where(eq(itemFieldValues.itemId, itemId));
  if (!categoryId) return;
  const defs = await db
    .select()
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.categoryId, categoryId));
  const values = defs
    .map((def) => {
      const raw = fd.get(`field_${def.id}`);
      let value = typeof raw === "string" ? raw.trim() : "";
      if (def.type === "boolean") value = raw === "on" || raw === "true" ? "true" : "false";
      if (def.required && def.type !== "boolean" && value === "") {
        throw new Error(`Полето „${def.name}“ е задължително.`);
      }
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
    description: optional(fd, "description"),
    categoryId: optionalInt(fd, "categoryId"),
    minQuantity: Math.max(0, int(fd, "minQuantity", 0)),
    unit: str(fd, "unit", "бр.") || "бр.",
    unitCost: Math.max(0, num(fd, "unitCost", 0)),
    unitPrice: Math.max(0, num(fd, "unitPrice", 0)),
    location: optional(fd, "location"),
    status: oneOf(fd, "status", ITEM_STATUSES, "active"),
  };
}

export async function createItem(fd: FormData) {
  const data = readItem(fd);
  const quantity = Math.max(0, int(fd, "quantity", 0));
  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(items).values({ ...data, quantity }).returning({ id: items.id });
    if (quantity > 0) {
      await tx.insert(stockMovements).values({
        itemId: row.id,
        type: "in",
        delta: quantity,
        quantityAfter: quantity,
        reason: "Начална наличност",
      });
    }
    return row.id;
  });
  await saveFieldValues(id, data.categoryId, fd);
  revalidateItems(id);
  redirect(`/items/${id}`);
}

export async function updateItem(id: number, fd: FormData) {
  const data = readItem(fd);
  await db
    .update(items)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(items.id, id));
  await saveFieldValues(id, data.categoryId, fd);
  revalidateItems(id);
  redirect(`/items/${id}`);
}

export async function deleteItem(id: number) {
  await db.delete(items).where(eq(items.id, id));
  revalidateItems();
  redirect("/items");
}

export async function archiveItems(ids: number[], archive: boolean) {
  if (!ids.length) return;
  await db
    .update(items)
    .set({ status: archive ? "archived" : "active", updatedAt: new Date().toISOString() })
    .where(inArray(items.id, ids));
  revalidateItems();
}

/**
 * Applies a stock movement and keeps `items.quantity` in sync.
 * `quantity` is always positive; the sign is derived from `type`
 * (for `adjust` it is the new absolute quantity).
 */
export async function applyMovement(
  itemId: number,
  type: MovementType,
  quantity: number,
  reason: string | null,
  shipmentId: number | null = null,
  tx: Pick<typeof db, "select" | "update" | "insert"> = db,
) {
  const [current] = await tx.select({ quantity: items.quantity }).from(items).where(eq(items.id, itemId));
  if (!current) throw new Error("Артикулът не е намерен.");
  let delta: number;
  if (type === "in") delta = Math.abs(quantity);
  else if (type === "out") delta = -Math.abs(quantity);
  else delta = quantity - current.quantity;
  const after = current.quantity + delta;
  if (after < 0) throw new Error("Наличността не може да бъде отрицателна.");
  if (delta === 0) return;
  await tx.update(items).set({ quantity: after, updatedAt: new Date().toISOString() }).where(eq(items.id, itemId));
  await tx.insert(stockMovements).values({ itemId, type, delta, quantityAfter: after, reason, shipmentId });
}

export async function adjustStock(itemId: number, fd: FormData) {
  const type = oneOf(fd, "type", MOVEMENT_TYPES, "in");
  const quantity = int(fd, "quantity", 0);
  if (quantity < 0 || (type !== "adjust" && quantity === 0)) throw new Error("Въведете валидно количество.");
  await applyMovement(itemId, type, quantity, optional(fd, "reason"));
  revalidateItems(itemId);
}
