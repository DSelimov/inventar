"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { categories, items, locations } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { str } from "@/lib/forms";
import { getDefaultLocation } from "@/lib/queries";
import { applyMovement } from "@/lib/stock";
import { act, redirectWith } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";
import { decimalsOf, itemDecimals, MAX_DECIMALS, parseQuantity } from "@/lib/quantity";
import { assertWithinLimit } from "@/lib/plans";

export type ImportRow = {
  sku: string;
  name: string;
  barcode?: string;
  category?: string;
  quantity?: number;
  minQuantity?: number;
  unit?: string;
  unitCost?: number;
  unitPrice?: number;
  location?: string;
  description?: string;
};

export const importItems = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  let rows: ImportRow[];
  try {
    rows = JSON.parse(str(fd, "rows")) as ImportRow[];
  } catch {
    throw new UserError("Невалидни данни за импорт.");
  }
  if (!rows.length) throw new UserError("Няма редове за импорт.");
  // само новите кодове заемат място в лимита на плана
  const existingSkus = new Set((await ctx.db.select({ sku: items.sku }).from(items)).map((r) => r.sku.toLowerCase()));
  await assertWithinLimit(ctx, "items", new Set(rows.filter((r) => r.sku && !existingSkus.has(r.sku.toLowerCase())).map((r) => r.sku.toLowerCase())).size);
  const setQuantities = str(fd, "setQuantities") === "1";

  const cats = await ctx.db.select().from(categories);
  const locs = await ctx.db.select().from(locations);
  const defaultLoc = await getDefaultLocation(ctx.db);
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const locByName = new Map(locs.flatMap((l) => [[l.name.toLowerCase(), l.id], [(l.code ?? "").toLowerCase(), l.id]] as const).filter(([k]) => k));

  let created = 0;
  let updated = 0;
  await ctx.db.transaction(async (tx) => {
    for (const r of rows) {
      if (!r.sku || !r.name) continue;
      let categoryId: number | null = null;
      if (r.category) {
        categoryId = catByName.get(r.category.toLowerCase()) ?? null;
        if (!categoryId) {
          const [c] = await tx.insert(categories).values({ name: r.category }).$returningId();
          categoryId = c.id;
          catByName.set(r.category.toLowerCase(), c.id);
        }
      }
      const existingItem = await tx.query.items.findFirst({ where: eq(items.sku, r.sku) });
      // нов артикул: знаците след запетаята се взимат от файла (12,5 кг → 1 знак); съществуващ запазва своите
      const decimals = existingItem ? itemDecimals(existingItem) : Math.min(MAX_DECIMALS, Math.max(decimalsOf(r.quantity ?? 0), decimalsOf(r.minQuantity ?? 0)));
      const base = {
        name: r.name,
        barcode: r.barcode || null,
        categoryId,
        minQuantity: parseQuantity(r.minQuantity, decimals, `Ред „${r.sku}“: минимално количество`),
        unit: r.unit || "бр.",
        unitCost: parseMoney(r.unitCost, `Ред „${r.sku}“: доставна цена`),
        unitPrice: parseMoney(r.unitPrice, `Ред „${r.sku}“: продажна цена`),
        description: r.description || null,
      };
      const existing = existingItem;
      let itemId: number;
      if (existing) {
        await tx.update(items).set({ ...base, updatedAt: new Date() }).where(eq(items.id, existing.id));
        itemId = existing.id;
        updated++;
      } else {
        const [row] = await tx.insert(items).values({ ...base, sku: r.sku, quantityDecimals: decimals }).$returningId();
        itemId = row.id;
        created++;
      }
      if (setQuantities && r.quantity !== undefined && Number.isFinite(r.quantity)) {
        const locationId = (r.location ? locByName.get(r.location.toLowerCase()) : undefined) ?? defaultLoc?.id;
        if (!locationId) throw new UserError("Няма локация за количествата. Създайте локация първо.");
        await applyMovement(tx, { actor: ctx.user, itemId, locationId, type: "adjust", quantity: parseQuantity(r.quantity, decimals, `Ред „${r.sku}“`), reason: "Импорт от CSV" });
      }
    }
  });
  await audit(ctx, "import", "item", null, { created, updated, rows: rows.length });
  revalidatePath("/items");
  revalidatePath("/");
  return redirectWith(`/items?imported=${created + updated}`, "Импортът приключи.");
});
