/**
 * Ценови групи на сървъра: история на цените и „Смяна на цени“ (масова промяна с преглед).
 * Чистите изчисления (група → цена, отстъпка, закръгляне) са в src/lib/pricing.ts.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { itemPrices, items, priceChanges, priceGroups, type PriceTarget } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { applyPercent } from "./money";
import { PRICE_ROUNDINGS, parsePercent, roundPrice, type PriceRounding } from "./pricing";

type Actor = { id: number; name: string } | null;

export type PriceChangeRow = { itemId: number; target: PriceTarget; priceGroupId?: number | null; oldPrice: number | null; newPrice: number | null };

/** Записва историята (само реалните промени). */
export async function recordPriceChanges(db: Db, actor: Actor, source: string, rows: PriceChangeRow[]) {
  const changed = rows.filter((r) => r.oldPrice !== r.newPrice);
  if (changed.length === 0) return 0;
  for (let i = 0; i < changed.length; i += 500) {
    await db.insert(priceChanges).values(
      changed.slice(i, i + 500).map((r) => ({
        itemId: r.itemId,
        target: r.target,
        priceGroupId: r.priceGroupId ?? null,
        oldPrice: r.oldPrice,
        newPrice: r.newPrice,
        source,
        userId: actor?.id ?? null,
        userName: actor?.name ?? null,
      })),
    );
  }
  return changed.length;
}

/** Цел: цената на дребно или цена в група. База: доставна, дребно, група или текущата цена на целта. */
export type BulkPriceParams = {
  target: "retail" | number;
  base: "retail" | "cost" | "current" | number;
  percent: number;
  rounding: PriceRounding;
  categoryId: number | null;
  /** Само артикули без цена в целевата група (при нова група). */
  onlyMissing: boolean;
};

const groupKey = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : null);

/** Параметрите от формата / адреса (един и същ формат за прегледа и за прилагането). */
export function readBulkParams(get: (key: string) => string | undefined): BulkPriceParams {
  const target = get("target") ?? "retail";
  const base = get("base") ?? "current";
  const rounding = (get("rounding") ?? "0.01") as PriceRounding;
  return {
    target: target === "retail" ? "retail" : (groupKey(target) ?? "retail"),
    base: base === "retail" || base === "cost" || base === "current" ? base : (groupKey(base) ?? "current"),
    percent: parsePercent(get("percent"), "Промяна", { min: -100, max: 1000 }),
    rounding: PRICE_ROUNDINGS.includes(rounding) ? rounding : "0.01",
    categoryId: groupKey(get("category") ?? ""),
    onlyMissing: get("onlyMissing") === "1" || get("onlyMissing") === "on",
  };
}

export type BulkPreviewRow = { itemId: number; sku: string; name: string; variantLabel: string | null; base: number; oldPrice: number | null; newPrice: number };

/** Новите цени без запис — за прегледа и за прилагането (едно и също изчисление). */
export async function previewBulkPrices(db: Db, p: BulkPriceParams): Promise<BulkPreviewRow[]> {
  const groupIds = [p.target, p.base].filter((x): x is number => typeof x === "number");
  if (groupIds.length) {
    const found = await db.select({ id: priceGroups.id }).from(priceGroups).where(inArray(priceGroups.id, groupIds));
    if (found.length !== new Set(groupIds).size) throw new UserError("Ценовата група не е намерена.");
  }
  const rows = await db
    .select({ id: items.id, sku: items.sku, name: items.name, variantLabel: items.variantLabel, unitCost: items.unitCost, unitPrice: items.unitPrice })
    .from(items)
    .where(and(eq(items.status, "active"), p.categoryId ? eq(items.categoryId, p.categoryId) : undefined))
    .orderBy(asc(items.name), asc(items.id));
  if (rows.length === 0) return [];
  const prices = groupIds.length ? await db.select().from(itemPrices).where(inArray(itemPrices.priceGroupId, groupIds)) : [];
  const priceIn = (groupId: number, itemId: number) => prices.find((x) => x.priceGroupId === groupId && x.itemId === itemId)?.price ?? null;

  const out: BulkPreviewRow[] = [];
  for (const r of rows) {
    const oldPrice = p.target === "retail" ? r.unitPrice : priceIn(p.target, r.id);
    if (p.onlyMissing && p.target !== "retail" && oldPrice !== null) continue;
    // база без цена в групата → цената на дребно (както при продажба)
    const base = p.base === "cost" ? r.unitCost : p.base === "retail" ? r.unitPrice : p.base === "current" ? (oldPrice ?? r.unitPrice) : (priceIn(p.base, r.id) ?? r.unitPrice);
    const newPrice = roundPrice(applyPercent(base, p.percent), p.rounding);
    out.push({ itemId: r.id, sku: r.sku, name: r.name, variantLabel: r.variantLabel, base, oldPrice, newPrice });
  }
  return out;
}

/** Прилага прегледа в една транзакция и записва историята. Връща броя променени цени. */
export async function applyBulkPrices(db: Db, actor: Actor, p: BulkPriceParams) {
  return db.transaction(async (tx) => {
    const rows = (await previewBulkPrices(tx, p)).filter((r) => r.oldPrice !== r.newPrice);
    for (const r of rows) {
      if (p.target === "retail") await tx.update(items).set({ unitPrice: r.newPrice, updatedAt: new Date() }).where(eq(items.id, r.itemId));
      else await tx.insert(itemPrices).values({ itemId: r.itemId, priceGroupId: p.target, price: r.newPrice }).onDuplicateKeyUpdate({ set: { price: r.newPrice } });
    }
    await recordPriceChanges(
      tx,
      actor,
      "Смяна на цени",
      rows.map((r) => ({ itemId: r.itemId, target: p.target === "retail" ? "retail" : "group", priceGroupId: p.target === "retail" ? null : p.target, oldPrice: r.oldPrice, newPrice: r.newPrice })),
    );
    return rows.length;
  });
}
