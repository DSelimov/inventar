"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { categories, items, locations, partners, PARTNER_TYPES } from "@/db/tenant-schema";
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
import { readTaxFields } from "@/lib/tax-ids";

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

export type PartnerImportRow = {
  name: string;
  eik?: string;
  vatNumber?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  type?: string;
  notes?: string;
};

const PARTNER_TYPE_WORDS: Record<string, (typeof PARTNER_TYPES)[number]> = { supplier: "supplier", доставчик: "supplier", customer: "customer", клиент: "customer", both: "both", двата: "both" };

/**
 * Партньори от CSV (напр. списъкът от Microinvest Склад Pro). Съвпадение по ЕИК, иначе по име: съществуващият
 * се допълва само с попълнените полета. Редовете с невалиден ЕИК/ДДС № се пропускат и се изброяват.
 */
export const importPartners = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  let rows: PartnerImportRow[];
  try {
    rows = JSON.parse(str(fd, "rows")) as PartnerImportRow[];
  } catch {
    throw new UserError("Невалидни данни за импорт.");
  }
  if (!rows.length) throw new UserError("Няма редове за импорт.");
  const all = await ctx.db.select({ id: partners.id, name: partners.name, eik: partners.eik }).from(partners);
  const byEik = new Map(all.filter((p) => p.eik).map((p) => [p.eik!, p.id]));
  const byName = new Map(all.map((p) => [p.name.trim().toLowerCase(), p.id]));
  let created = 0;
  let updated = 0;
  const skipped: string[] = [];
  await ctx.db.transaction(async (tx) => {
    for (const r of rows) {
      const name = r.name?.trim();
      if (!name) continue;
      let tax: ReturnType<typeof readTaxFields>;
      try {
        // Microinvest пише ДДС номера понякога без „BG“
        const vat = r.vatNumber?.trim().replace(/\s/g, "");
        tax = readTaxFields({ eik: r.eik, vatNumber: vat && /^\d+$/.test(vat) ? `BG${vat}` : vat });
      } catch (e) {
        skipped.push(`${name}: ${(e as Error).message}`);
        continue;
      }
      const address = [r.city?.trim(), r.address?.trim()].filter(Boolean).join(", ") || null;
      const data = {
        name: name.slice(0, 200),
        contactName: r.contactName?.trim() || null,
        email: r.email?.trim() || null,
        phone: r.phone?.trim() || null,
        address: address?.slice(0, 500) ?? null,
        notes: r.notes?.trim() || null,
        ...tax,
      };
      const type = PARTNER_TYPE_WORDS[(r.type ?? "").trim().toLowerCase()] ?? "both";
      const id = (tax.eik && byEik.get(tax.eik)) || byName.get(name.toLowerCase());
      if (id) {
        // само попълнените полета; празно във файла не трие съществуващото
        const set = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== false));
        await tx.update(partners).set(set).where(eq(partners.id, id));
        updated++;
      } else {
        const [row] = await tx.insert(partners).values({ ...data, type }).$returningId();
        if (tax.eik) byEik.set(tax.eik, row.id);
        byName.set(name.toLowerCase(), row.id);
        created++;
      }
    }
  });
  await audit(ctx, "import", "partner", null, { created, updated, skipped: skipped.length });
  revalidatePath("/partners");
  const msg = `Партньори: нови ${created}, обновени ${updated}.`;
  return skipped.length ? `${msg} Пропуснати ${skipped.length}: ${skipped.slice(0, 5).join("; ")}${skipped.length > 5 ? "…" : ""}` : msg;
});
