import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getItem } from "@/app/api/v1/items/[id]/route";
import { GET as listItemsApi, POST as createItemApi } from "@/app/api/v1/items/route";
import { controlDb } from "@/db/control";
import { organizations } from "@/db/control-schema";
import { apiKeys, items, type ApiScope } from "@/db/tenant-schema";
import { sha256 } from "@/lib/auth-crypto";
import { listItems } from "@/lib/queries";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

let a: TestTenant;
let b: TestTenant;
beforeAll(async () => {
  [a, b] = await Promise.all([createTenant("a"), createTenant("b")]);
});

async function apiKey(t: TestTenant, scopes: ApiScope[]) {
  const token = `inv_${randomBytes(16).toString("hex")}`;
  await t.db.insert(apiKeys).values({ name: "test", prefix: token.slice(0, 12), keyHash: sha256(token), scopes });
  return token;
}
/** Заявка към API-то на поддомейна на организацията (APP_DOMAIN=inventar.test). */
function req(t: TestTenant | string, path: string, init: { token?: string; method?: string; body?: unknown } = {}) {
  const host = `${typeof t === "string" ? t : t.org.subdomain}.inventar.test`;
  return new Request(`https://${host}${path}`, {
    method: init.method ?? "GET",
    headers: { host, ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe("провизиране", () => {
  it("създава отделна база, прилага всички миграции и активира организацията", async () => {
    expect(a.org.status).toBe("active");
    expect(a.org.dbName).toBe(`${process.env.TENANT_DB_PREFIX}${a.org.subdomain.replace(/-/g, "_")}`);
    expect(a.org.dbName).not.toBe(b.org.dbName);

    const [tables] = (await a.db.execute(sql`select table_name as t from information_schema.tables where table_schema = database()`)) as unknown as [Array<{ t: string }>];
    const names = tables.map((r) => r.t);
    for (const t of ["items", "stock_levels", "lots", "stock_movements", "shipments", "orders", "api_keys", "item_images"]) expect(names).toContain(t);

    const journal = JSON.parse(readFileSync("drizzle/tenant/meta/_journal.json", "utf8")) as { entries: unknown[] };
    const [applied] = (await a.db.execute(sql`select count(*) as n from __drizzle_migrations`)) as unknown as [Array<{ n: number }>];
    expect(Number(applied[0].n)).toBe(journal.entries.length);

    const [row] = await controlDb.select().from(organizations).where(eq(organizations.id, a.org.id));
    expect(row.status).toBe("active");
  });
});

describe("изолация на данните", () => {
  it("артикул, записан в A, не се вижда в B", async () => {
    await createItem(a.db, "none", { name: "Само в А" });
    expect((await listItems(a.db, { q: "Само в А" })).map((i) => i.name)).toEqual(["Само в А"]);
    expect(await listItems(b.db, { q: "Само в А" })).toEqual([]);
  });
});

describe("REST API: ключове и права", () => {
  it("без ключ или с невалиден ключ → 401", async () => {
    expect((await listItemsApi(req(a, "/api/v1/items"))).status).toBe(401);
    expect((await listItemsApi(req(a, "/api/v1/items", { token: "inv_nope" }))).status).toBe(401);
  });

  it("ключ на A е невалиден на поддомейна на B", async () => {
    const keyA = await apiKey(a, ["read", "write"]);
    expect((await listItemsApi(req(a, "/api/v1/items", { token: keyA }))).status).toBe(200);
    const res = await listItemsApi(req(b, "/api/v1/items", { token: keyA }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Невалиден API ключ." });
  });

  it("ключ само за четене не може да записва (403); ключ за запис създава в своята база", async () => {
    const readOnly = await apiKey(a, ["read"]);
    const writer = await apiKey(a, ["read", "write"]);
    const body = { name: "API артикул", sku: `API-${Date.now()}` };
    expect((await createItemApi(req(a, "/api/v1/items", { token: readOnly, method: "POST", body }))).status).toBe(403);

    const res = await createItemApi(req(a, "/api/v1/items", { token: writer, method: "POST", body }));
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: number; sku: string } };
    expect(data.sku).toBe(body.sku);
    expect(await a.db.select().from(items).where(eq(items.sku, body.sku))).toHaveLength(1);
    expect(await b.db.select().from(items).where(eq(items.sku, body.sku))).toHaveLength(0);
  });

  it("ключ на B не вижда артикул на A по идентификатор", async () => {
    const id = await createItem(a.db, "none", { name: "Таен" });
    const keyA = await apiKey(a, ["read"]);
    const keyB = await apiKey(b, ["read"]);
    expect((await getItem(req(a, `/api/v1/items/${id}`, { token: keyA }), params(id))).status).toBe(200);
    // B няма артикули, така че същият идентификатор там не съществува
    expect(await b.db.select().from(items)).toHaveLength(0);
    expect((await getItem(req(b, `/api/v1/items/${id}`, { token: keyB }), params(id))).status).toBe(404);
  });

  it("непознат поддомейн → 404; спряна организация → 503", async () => {
    expect((await listItemsApi(req("nyama-takava", "/api/v1/items", { token: "inv_x" }))).status).toBe(404);
    const t = await createTenant("susp");
    const key = await apiKey(t, ["read"]);
    await controlDb.update(organizations).set({ status: "suspended" }).where(eq(organizations.id, t.org.id));
    expect((await listItemsApi(req(t, "/api/v1/items", { token: key }))).status).toBe(503);
  });
});
