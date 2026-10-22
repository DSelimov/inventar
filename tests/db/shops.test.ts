import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { orderLines, orders, partners, shopProducts } from "@/db/tenant-schema";
import { saveIntegration } from "@/lib/integrations/core";
import { importOrders, linkProducts, pushStock, syncShops } from "@/lib/integrations/shops/sync";
import { applyMovement } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();
afterEach(() => vi.unstubAllGlobals());

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

function stub(handler: (url: string, body: unknown) => { status?: number; json: unknown } | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method: init.method ?? "GET", body, headers: (init.headers ?? {}) as Record<string, string> });
    const r = handler(url, body);
    if (!r) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

async function stocked(qty: number) {
  const id = await createItem(t.db);
  if (qty) await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: id, locationId: t.main, type: "in", quantity: qty }));
  const [row] = await t.db.query.items.findMany({ where: (i, { eq }) => eq(i.id, id) });
  return row;
}

beforeAll(async () => {
  t = await createTenant("shops");
});

describe("WooCommerce", () => {
  let simple: Awaited<ReturnType<typeof stocked>>;
  let variant: Awaited<ReturnType<typeof stocked>>;

  beforeAll(async () => {
    simple = await stocked(10);
    variant = await stocked(4);
    await saveIntegration(t.db, "woocommerce", { enabled: true, credentials: { consumerKey: "ck_1", consumerSecret: "cs_1" }, settings: { url: "https://shop.test/", importStatuses: "processing" } });
  });

  it("свързва прости продукти и варианти по SKU (без значение от регистъра); непознатите се изброяват", async () => {
    const calls = stub((url) => {
      if (/\/products\?status=any/.test(url))
        return {
          json: [
            { id: 11, name: "Прост", sku: simple.sku.toLowerCase(), type: "simple" },
            { id: 12, name: "Тениска", sku: "", type: "variable", variations: [121] },
            { id: 13, name: "Чужд", sku: "NOPE-1", type: "simple" },
          ],
        };
      if (/\/products\/12\/variations/.test(url)) return { json: [{ id: 121, sku: variant.sku, name: "M" }] };
    });
    const r = await linkProducts(t.db, "woocommerce");
    expect(r).toEqual({ linked: 2, unknown: ["NOPE-1"] });
    expect(calls[0].headers.Authorization).toBe(`Basic ${Buffer.from("ck_1:cs_1").toString("base64")}`);
    expect(calls[0].url).toContain("https://shop.test/wp-json/wc/v3/products?status=any&per_page=100&page=1");
    const links = await t.db.select().from(shopProducts).where(eq(shopProducts.provider, "woocommerce"));
    expect(links.find((l) => l.itemId === variant.id)).toMatchObject({ externalId: "12", variantId: "121" });
  });

  it("наличността = на склад − резервирано; изпраща само промените; неприетите се опитват пак", async () => {
    let fail = true;
    const calls = stub((url, body) => {
      if (url.endsWith("/products/batch")) return { json: { update: (body as { update: Array<{ id: number }> }).update.map((u) => ({ id: u.id })) } };
      if (url.endsWith("/products/12/variations/batch")) return fail ? { status: 500, json: { message: "boom" } } : { json: { update: [{ id: 121 }] } };
    });
    let r = await pushStock(t.db, "woocommerce");
    expect(r).toEqual({ pushed: 1, failed: [variant.sku] });
    expect(calls.find((c) => c.url.endsWith("/products/batch"))!.body).toEqual({ update: [{ id: 11, manage_stock: true, stock_quantity: 10 }] });

    // потвърдена продажба резервира 3 бр.
    const [{ id: orderId }] = await t.db.insert(orders).values({ type: "sales", number: `ПР-T-${Date.now()}`, status: "confirmed", locationId: t.main }).$returningId();
    await t.db.insert(orderLines).values({ orderId, itemId: simple.id, quantity: 3, unitPrice: 5 });
    fail = false;
    calls.length = 0;
    r = await pushStock(t.db, "woocommerce");
    expect(r).toEqual({ pushed: 2, failed: [] });
    expect(calls.find((c) => c.url.endsWith("/products/batch"))!.body).toEqual({ update: [{ id: 11, manage_stock: true, stock_quantity: 7 }] });
    expect(calls.find((c) => c.url.endsWith("/variations/batch"))!.body).toEqual({ update: [{ id: 121, manage_stock: true, stock_quantity: 4 }] });

    calls.length = 0;
    expect(await pushStock(t.db, "woocommerce")).toEqual({ pushed: 0, failed: [] });
    expect(calls).toHaveLength(0);
    await t.db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, orderId));
  });

  it("внася поръчки като потвърдени продажби: клиент, цени без ДДС, без дубли; непознат SKU — в бележката", async () => {
    const order = (id: number, lines: unknown[]) => ({
      id,
      number: String(id),
      date_created_gmt: "2026-10-20T08:30:00",
      currency: "EUR",
      billing: { first_name: "Мария", last_name: "Иванова", company: "", email: "maria@example.bg", phone: "0888000111", address_1: "ул. Роза 5", address_2: "", city: "Пловдив", postcode: "4000" },
      line_items: lines,
    });
    const calls = stub((url) => {
      if (/\/orders\?/.test(url))
        return {
          json: [
            order(501, [
              { sku: simple.sku, name: "Прост", quantity: 2, subtotal: "21.00", subtotal_tax: "4.20" },
              { sku: "NOPE-1", name: "Чужд", quantity: 1, subtotal: "5.00", subtotal_tax: "1.00" },
            ]),
            order(502, [{ sku: "NOPE-1", name: "Чужд", quantity: 1, subtotal: "5.00", subtotal_tax: "1.00" }]),
          ],
        };
    });
    const r = await importOrders(t.db, "woocommerce", actor, "BGN");
    expect(r.created).toHaveLength(1);
    expect(r.errors).toEqual([expect.stringContaining("502: няма артикули")]);
    expect(decodeURIComponent(calls[0].url)).toContain("status=processing&after=");

    const [o] = await t.db.select().from(orders).where(and(eq(orders.externalSource, "woocommerce"), eq(orders.externalId, "501")));
    expect(o).toMatchObject({ type: "sales", status: "confirmed", orderDate: "2026-10-20", pricesIncludeVat: false, locationId: t.main });
    expect(o.notes).toContain("WooCommerce поръчка 501");
    expect(o.notes).toContain("NOPE-1 Чужд × 1");
    expect(o.notes).toContain("Цените са в EUR");
    const lines = await t.db.select().from(orderLines).where(eq(orderLines.orderId, o.id));
    expect(lines).toEqual([expect.objectContaining({ itemId: simple.id, quantity: 2, unitPrice: 10.5 })]);
    const [p] = await t.db.select().from(partners).where(eq(partners.id, o.partnerId!));
    expect(p).toMatchObject({ name: "Мария Иванова", email: "maria@example.bg", type: "customer", address: "ул. Роза 5, 4000, Пловдив" });

    // повторен внос: нито нова поръчка, нито нов клиент
    const again = await importOrders(t.db, "woocommerce", actor, "BGN");
    expect(again.created).toHaveLength(0);
    expect(await t.db.$count(orders, eq(orders.externalSource, "woocommerce"))).toBe(1);
    expect(await t.db.$count(partners, eq(partners.email, "maria@example.bg"))).toBe(1);
  });
});

describe("Shopify", () => {
  let item: Awaited<ReturnType<typeof stocked>>;

  beforeAll(async () => {
    item = await stocked(6);
    await saveIntegration(t.db, "shopify", { enabled: true, credentials: { accessToken: "shpat_x" }, settings: { shop: "demo.myshopify.com", shopifyLocationId: "gid://shopify/Location/9" } });
  });

  it("свързва вариантите по страници, внася поръчката (цени с ДДС) и изпраща свободното количество", async () => {
    const calls = stub((url, body) => {
      const q = (body as { query: string; variables: Record<string, unknown> }).query;
      const v = (body as { variables: Record<string, unknown> }).variables;
      if (q.includes("productVariants")) {
        return v.after
          ? { json: { data: { productVariants: { nodes: [{ id: "gid://shopify/ProductVariant/2", sku: item.sku, displayName: "Чаша", inventoryItem: { id: "gid://shopify/InventoryItem/22" }, product: { id: "gid://shopify/Product/1" } }], pageInfo: { hasNextPage: false, endCursor: null } } } } }
          : { json: { data: { productVariants: { nodes: [{ id: "gid://shopify/ProductVariant/1", sku: null, displayName: "Без SKU", inventoryItem: { id: "x" }, product: { id: "y" } }], pageInfo: { hasNextPage: true, endCursor: "c1" } } } } };
      }
      if (q.includes("orders(")) {
        return {
          json: {
            data: {
              orders: {
                nodes: [
                  {
                    id: "gid://shopify/Order/77",
                    name: "#1077",
                    createdAt: "2026-10-21T21:30:00Z", // 22.10 в София
                    currencyCode: "BGN",
                    taxesIncluded: true,
                    email: null,
                    phone: null,
                    billingAddress: { name: "Петър Петров", company: "Пример ООД", phone: "0899", address1: "бул. Витоша 1", address2: null, zip: "1000", city: "София" },
                    lineItems: { nodes: [{ sku: item.sku, name: "Чаша", quantity: 2, originalUnitPriceSet: { shopMoney: { amount: "12.00" } } }] },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        };
      }
      if (q.includes("inventorySetQuantities")) return { json: { data: { inventorySetQuantities: { userErrors: [] } } } };
    });
    const [r] = await syncShops(t.db, actor, { only: "shopify", currency: "BGN" });
    expect(r).toMatchObject({ provider: "shopify", linked: 1, pushed: 1, errors: [] });
    expect(calls[0].url).toBe("https://demo.myshopify.com/admin/api/2026-10/graphql.json");
    expect(calls[0].headers["X-Shopify-Access-Token"]).toBe("shpat_x");

    const [o] = await t.db.select().from(orders).where(eq(orders.externalId, "gid://shopify/Order/77"));
    expect(o).toMatchObject({ externalSource: "shopify", pricesIncludeVat: true, orderDate: "2026-10-22" });
    expect(o.notes).not.toContain("Цените са в");
    const [p] = await t.db.select().from(partners).where(eq(partners.id, o.partnerId!));
    expect(p.name).toBe("Пример ООД");

    const set = calls.find((c) => (c.body as { query: string }).query.includes("inventorySetQuantities"))!;
    const vars = (set.body as { variables: { input: { quantities: unknown[] }; key: string } }).variables;
    // 6 на склад − 2 по внесената поръчка
    expect(vars.input.quantities).toEqual([{ inventoryItemId: "gid://shopify/InventoryItem/22", locationId: "gid://shopify/Location/9", quantity: 4, changeFromQuantity: null }]);
    expect(vars.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("грешка от GraphQL се показва, а наличността остава за следващия опит", async () => {
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: item.id, locationId: t.main, type: "in", quantity: 1 }));
    stub(() => ({ json: { data: { inventorySetQuantities: { userErrors: [{ field: ["input", "quantities", "0", "locationId"], message: "Location not found" }] } } } }));
    expect(await pushStock(t.db, "shopify")).toEqual({ pushed: 0, failed: [item.sku] });
    const [link] = await t.db.select().from(shopProducts).where(eq(shopProducts.itemId, item.id));
    expect(link.syncedQuantity).toBe(4);
  });
});
