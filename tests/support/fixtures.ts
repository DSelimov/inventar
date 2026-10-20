/* Общи помощни функции за тестовете с база: нова организация с мигрирана база и основни данни. */
import { eq } from "drizzle-orm";
import { afterAll } from "vitest";
import { controlDb } from "@/db/control";
import { organizations, type Organization } from "@/db/control-schema";
import { closeTenantPools, getTenantDb, provisionTenant, tenantDbName, type TenantDb } from "@/db/tenant";
import { items, locations, type TRACKING_MODES } from "@/db/tenant-schema";

export type TestTenant = { org: Organization; db: TenantDb; main: number; shop: number };

/** Уникален поддомейн за всеки тест-файл/извикване. */
const unique = (base: string) => `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Организация с отделна база (режим auto), мигрирана, с две локации: main (по подразбиране) и shop. */
export async function createTenant(base = "t"): Promise<TestTenant> {
  const subdomain = unique(base);
  const [{ id }] = await controlDb.insert(organizations).values({ name: `Тест ${subdomain}`, subdomain, dbName: tenantDbName(subdomain) }).$returningId();
  const [row] = await controlDb.select().from(organizations).where(eq(organizations.id, id));
  const org = await provisionTenant(row);
  const db = getTenantDb(org);
  const [{ id: main }] = await db.insert(locations).values({ name: "Основен склад", code: "MAIN", isDefault: true }).$returningId();
  const [{ id: shop }] = await db.insert(locations).values({ name: "Магазин", code: "SHOP" }).$returningId();
  return { org, db, main, shop };
}

export async function createItem(db: TenantDb, tracking: (typeof TRACKING_MODES)[number] = "none", extra: Partial<typeof items.$inferInsert> = {}) {
  const sku = unique("SKU").toUpperCase();
  const [{ id }] = await db.insert(items).values({ sku, name: `Артикул ${sku}`, tracking, ...extra }).$returningId();
  return id;
}

/** Затваря връзките след всеки тест-файл, за да приключи процесът. */
export function closeConnectionsAfterAll() {
  afterAll(async () => {
    await closeTenantPools();
    await controlDb.$client.end();
  });
}
