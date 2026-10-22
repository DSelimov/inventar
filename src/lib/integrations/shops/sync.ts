import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { integrations, items, orderLines, orders, partners, shopProducts, stockLevels } from "@/db/tenant-schema";
import { APP_TIMEZONE } from "../../dates";
import { nextNumber } from "../../numbering";
import { addQty, subQty } from "../../quantity";
import { getDefaultLocation } from "../../queries";
import type { Actor } from "../../stock";
import { assignVat } from "../../vat-rates";
import { emit } from "../../webhooks";
import { getIntegration, PROVIDERS, type IntegrationConfig } from "../core";
import { isShop, SHOPS, type ShopId } from ".";
import type { ShopOrder } from "./types";

/**
 * Синхронизация с онлайн магазините. Инвентар е източникът за наличността, магазинът — за поръчките:
 *  - свързване по SKU (shop_products), еднократно и при нови продукти;
 *  - наличност = на склад (в избраната локация или общо) − неизпълненото по потвърдени продажби;
 *    изпраща се само където се различава от последно изпратената (неуспешните се опитват пак);
 *  - поръчките се внасят като потвърдени продажби, по externalSource + externalId без дубли.
 * Стартира се от pnpm shops:sync (cron) или от бутона в Настройки › Интеграции.
 */

const FIRST_IMPORT_DAYS = 7;
/** Застъпване при вноса, за да не се изпуснат поръчки около границата (дублите се пропускат). */
const OVERLAP_MS = 60 * 60 * 1000;

export async function linkProducts(db: Db, provider: ShopId) {
  const cfg = await getIntegration(db, provider);
  const remote = await SHOPS[provider].products(db, cfg);
  const own = await db.select({ id: items.id, sku: items.sku }).from(items);
  const bySku = new Map(own.map((i) => [i.sku.trim().toLowerCase(), i.id]));
  const linked = new Map<number, (typeof remote)[number]>();
  const unknown: string[] = [];
  for (const p of remote) {
    const id = bySku.get(p.sku.trim().toLowerCase());
    if (id) linked.set(id, p);
    else unknown.push(p.sku);
  }
  await db.transaction(async (tx) => {
    await tx.delete(shopProducts).where(eq(shopProducts.provider, provider));
    if (linked.size)
      await tx.insert(shopProducts).values([...linked].map(([itemId, p]) => ({ provider, itemId, externalId: p.externalId, variantId: p.variantId, sku: p.sku })));
  });
  return { linked: linked.size, unknown };
}

/** Количество за магазина по артикул: наличност − резервирано от потвърдени продажби. */
async function availableFor(db: Db, cfg: IntegrationConfig, itemIds: number[]) {
  const locationId = Number(cfg.settings.locationId) || null;
  const onHand = new Map<number, number>();
  if (locationId) {
    const rows = await db.select({ itemId: stockLevels.itemId, q: stockLevels.quantity }).from(stockLevels).where(and(eq(stockLevels.locationId, locationId), inArray(stockLevels.itemId, itemIds)));
    for (const r of rows) onHand.set(r.itemId, r.q);
  } else {
    for (const r of await db.select({ id: items.id, q: items.quantity }).from(items).where(inArray(items.id, itemIds))) onHand.set(r.id, r.q);
  }
  const open = await db
    .select({ itemId: orderLines.itemId, q: orderLines.quantity, done: orderLines.fulfilledQuantity })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(and(eq(orders.type, "sales"), inArray(orders.status, ["confirmed", "partial"]), inArray(orderLines.itemId, itemIds), locationId ? eq(orders.locationId, locationId) : undefined));
  const reserved = new Map<number, number>();
  for (const l of open) reserved.set(l.itemId, addQty(reserved.get(l.itemId) ?? 0, Math.max(0, subQty(l.q, l.done))));
  return new Map(itemIds.map((id) => [id, Math.max(0, subQty(onHand.get(id) ?? 0, reserved.get(id) ?? 0))]));
}

export async function pushStock(db: Db, provider: ShopId) {
  const cfg = await getIntegration(db, provider);
  const links = await db.select().from(shopProducts).where(eq(shopProducts.provider, provider));
  if (!links.length) return { pushed: 0, failed: [] as string[] };
  const want = await availableFor(db, cfg, links.map((l) => l.itemId));
  const changed = links.filter((l) => l.syncedQuantity === null || l.syncedQuantity !== want.get(l.itemId));
  if (!changed.length) return { pushed: 0, failed: [] as string[] };
  const { failed } = await SHOPS[provider].pushStock(
    db,
    cfg,
    changed.map((l) => ({ externalId: l.externalId, variantId: l.variantId, sku: l.sku, quantity: want.get(l.itemId) ?? 0 })),
  );
  const bad = new Set(failed);
  const ok = changed.filter((l) => !bad.has(l.sku));
  for (const l of ok) await db.update(shopProducts).set({ syncedQuantity: want.get(l.itemId) ?? 0, syncedAt: new Date() }).where(and(eq(shopProducts.provider, provider), eq(shopProducts.itemId, l.itemId)));
  return { pushed: ok.length, failed };
}

const localDate = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: APP_TIMEZONE });

async function customer(tx: Db, c: ShopOrder["customer"]) {
  const [found] = c.email
    ? await tx.select({ id: partners.id }).from(partners).where(eq(partners.email, c.email)).limit(1)
    : await tx.select({ id: partners.id }).from(partners).where(eq(partners.name, c.name)).limit(1);
  if (found) return found.id;
  const [{ id }] = await tx.insert(partners).values({ type: "customer", name: c.name.slice(0, 200), email: c.email, phone: c.phone, address: c.address?.slice(0, 500) ?? null }).$returningId();
  return id;
}

export async function importOrders(db: TenantDb, provider: ShopId, actor: Actor, currency?: string) {
  const cfg = await getIntegration(db, provider);
  const since = cfg.lastSyncAt ? new Date(cfg.lastSyncAt.getTime() - OVERLAP_MS) : new Date(Date.now() - FIRST_IMPORT_DAYS * 86_400_000);
  const startedAt = new Date();
  const remote = await SHOPS[provider].orders(db, cfg, since);
  const known = remote.length
    ? new Set(
        (await db.select({ id: orders.externalId }).from(orders).where(and(eq(orders.externalSource, provider), inArray(orders.externalId, remote.map((o) => o.externalId))))).map((r) => r.id),
      )
    : new Set<string | null>();
  const skus = [...new Set(remote.flatMap((o) => o.lines.map((l) => l.sku?.trim().toLowerCase()).filter((s): s is string => Boolean(s))))];
  const bySku = new Map(
    skus.length ? (await db.select({ id: items.id, sku: items.sku }).from(items).where(sql`lower(${items.sku}) in (${sql.join(skus.map((s) => sql`${s}`), sql`, `)})`)).map((i) => [i.sku.toLowerCase(), i.id]) : [],
  );
  const location = Number(cfg.settings.locationId) || (await getDefaultLocation(db))?.id || null;
  const name = PROVIDERS[provider].name;
  const created: string[] = [];
  const errors: string[] = [];
  for (const o of remote) {
    if (known.has(o.externalId)) continue;
    const matched = o.lines.filter((l) => l.sku && bySku.has(l.sku.trim().toLowerCase()) && l.quantity > 0);
    const missing = o.lines.filter((l) => !matched.includes(l));
    if (!matched.length) {
      errors.push(`${o.number}: няма артикули с тези SKU (${o.lines.map((l) => l.sku || l.name).join(", ")})`);
      continue;
    }
    const lines = await assignVat(db, matched.map((l) => ({ itemId: bySku.get(l.sku!.trim().toLowerCase())!, quantity: l.quantity, unitPrice: l.unitPrice })));
    const notes = [
      `${name} поръчка ${o.number}.`,
      o.customer.address && `Адрес: ${o.customer.address}`,
      missing.length && `Невнесени редове (няма SKU в Инвентар): ${missing.map((l) => `${l.sku || "без SKU"} ${l.name} × ${l.quantity}`).join("; ")}`,
      currency && o.currency && o.currency !== currency && `Цените са в ${o.currency} (валутата на магазина).`,
    ].filter(Boolean);
    try {
      const r = await db.transaction(async (tx) => {
        const number = await nextNumber(tx, "sales");
        const [{ id }] = await tx
          .insert(orders)
          .values({
            type: "sales",
            number,
            partnerId: await customer(tx, o.customer),
            locationId: location,
            status: "confirmed",
            orderDate: localDate(o.createdAt),
            notes: notes.join("\n"),
            pricesIncludeVat: o.pricesIncludeVat,
            externalSource: provider,
            externalId: o.externalId,
            createdBy: actor?.id ?? null,
          })
          .$returningId();
        await tx.insert(orderLines).values(lines.map((l) => ({ ...l, orderId: id })));
        return { id, number };
      });
      created.push(r.number);
      emit(db, "order.created", { id: r.id, number: r.number, type: "sales", source: provider, externalId: o.externalId, lines });
    } catch (e) {
      // паралелен внос на същата поръчка — уникалният индекс я спира
      if ((e as { cause?: { code?: string }; code?: string }).cause?.code === "ER_DUP_ENTRY" || (e as { code?: string }).code === "ER_DUP_ENTRY") continue;
      errors.push(`${o.number}: ${(e as Error).message}`);
    }
  }
  await db.update(integrations).set({ lastSyncAt: startedAt }).where(eq(integrations.provider, provider));
  return { created, errors };
}

export type ShopSyncResult = { provider: ShopId; linked?: number; pushed: number; created: string[]; errors: string[] };

/** Всички включени магазини: свързване (ако още няма), наличност, поръчки. Грешка в един не спира другите. */
export async function syncShops(db: TenantDb, actor: Actor, opts: { only?: ShopId; currency?: string } = {}) {
  const out: ShopSyncResult[] = [];
  for (const provider of Object.keys(SHOPS).filter(isShop)) {
    if (opts.only && provider !== opts.only) continue;
    const cfg = await getIntegration(db, provider);
    if (!cfg.enabled) continue;
    const r: ShopSyncResult = { provider, pushed: 0, created: [], errors: [] };
    try {
      const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(shopProducts).where(eq(shopProducts.provider, provider));
      if (!n) r.linked = (await linkProducts(db, provider)).linked;
      // първо поръчките: внесените веднага намаляват свободното количество, което се изпраща
      const imported = await importOrders(db, provider, actor, opts.currency);
      r.created = imported.created;
      r.errors.push(...imported.errors);
      const pushed = await pushStock(db, provider);
      r.pushed = pushed.pushed;
      if (pushed.failed.length) r.errors.push(`неприета наличност за ${pushed.failed.join(", ")}`);
    } catch (e) {
      r.errors.push((e as Error).message);
    }
    out.push(r);
  }
  return out;
}
