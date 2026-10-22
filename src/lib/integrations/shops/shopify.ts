import "server-only";
import { randomUUID } from "node:crypto";
import { UserError } from "../../errors";
import { parseMoney } from "../../money";
import { http, type IntegrationConfig } from "../core";
import type { Shop, ShopOrder, ShopProduct } from "./types";

/**
 * Shopify Admin GraphQL API (версия SHOPIFY_API_VERSION, по подразбиране 2026-10), custom app с
 * Admin API access token (scopes: read_products, read_inventory, write_inventory, read_orders).
 * Наличност: inventorySetQuantities (от 2026-04 изисква changeFromQuantity и @idempotent).
 */
const VERSION = process.env.SHOPIFY_API_VERSION || "2026-10";
type DbArg = Parameters<Shop["products"]>[0];

function endpoint(cfg: IntegrationConfig) {
  const shop = (cfg.settings.shop ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!shop) throw new UserError("Shopify: попълнете магазина (magazin.myshopify.com).");
  if (!cfg.credentials.accessToken) throw new UserError("Shopify: попълнете Admin API access token.");
  return `https://${shop}/admin/api/${VERSION}/graphql.json`;
}

async function gql<T>(db: DbArg, cfg: IntegrationConfig, action: string, query: string, variables: Record<string, unknown> = {}) {
  const r = await http(db, "shopify", action, endpoint(cfg), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": cfg.credentials.accessToken },
    body: JSON.stringify({ query, variables }),
  });
  const body = r.body as { data?: T; errors?: Array<{ message: string }> | string } | null;
  if (r.status >= 400 || body?.errors) {
    const msg = Array.isArray(body?.errors) ? body.errors.map((e) => e.message).join("; ") : (body?.errors ?? `HTTP ${r.status}`);
    throw new UserError(`Shopify: ${msg}`);
  }
  return body!.data as T;
}

const VARIANTS = `query($after: String) {
  productVariants(first: 250, after: $after) {
    nodes { id sku displayName inventoryItem { id } product { id } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const SET = `mutation($input: InventorySetQuantitiesInput!, $key: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $key) {
    userErrors { code field message }
  }
}`;

const ORDERS = `query($after: String, $query: String) {
  orders(first: 50, after: $after, query: $query, sortKey: CREATED_AT) {
    nodes {
      id name createdAt currencyCode taxesIncluded email phone
      billingAddress { name company phone address1 address2 zip city }
      lineItems(first: 100) { nodes { sku name quantity originalUnitPriceSet { shopMoney { amount } } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

type Page<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
type Variant = { id: string; sku: string | null; displayName: string; inventoryItem: { id: string }; product: { id: string } };
type Order = {
  id: string;
  name: string;
  createdAt: string;
  currencyCode: string;
  taxesIncluded: boolean;
  email: string | null;
  phone: string | null;
  billingAddress: { name: string | null; company: string | null; phone: string | null; address1: string | null; address2: string | null; zip: string | null; city: string | null } | null;
  lineItems: { nodes: Array<{ sku: string | null; name: string; quantity: number; originalUnitPriceSet: { shopMoney: { amount: string } } }> };
};

export const shopify: Shop = {
  async products(db, cfg) {
    const out: ShopProduct[] = [];
    let after: string | null = null;
    for (let i = 0; i < 200; i++) {
      const d: { productVariants: Page<Variant> } = await gql(db, cfg, "variants", VARIANTS, { after });
      for (const v of d.productVariants.nodes) if (v.sku) out.push({ sku: v.sku, externalId: v.product.id, variantId: v.inventoryItem.id, name: v.displayName });
      if (!d.productVariants.pageInfo.hasNextPage) break;
      after = d.productVariants.pageInfo.endCursor;
    }
    return out;
  },

  async pushStock(db, cfg, updates) {
    const locationId = cfg.settings.shopifyLocationId;
    if (!locationId) throw new UserError("Shopify: попълнете location (gid://shopify/Location/…).");
    const failed: string[] = [];
    for (let i = 0; i < updates.length; i += 250) {
      const chunk = updates.slice(i, i + 250);
      const input = {
        name: "available",
        reason: "correction",
        referenceDocumentUri: `inventar://stock/${new Date().toISOString()}`,
        quantities: chunk.map((u) => ({ inventoryItemId: u.variantId, locationId, quantity: Math.floor(u.quantity), changeFromQuantity: null })),
      };
      try {
        const d = await gql<{ inventorySetQuantities: { userErrors: Array<{ field: string[] | null; message: string }> } }>(db, cfg, "stock", SET, { input, key: randomUUID() });
        // field = ["input", "quantities", "<индекс>", …]
        for (const e of d.inventorySetQuantities.userErrors) {
          const idx = Number(e.field?.[2]);
          failed.push(...(Number.isInteger(idx) && chunk[idx] ? [chunk[idx].sku] : chunk.map((u) => u.sku)));
        }
      } catch {
        failed.push(...chunk.map((u) => u.sku));
      }
    }
    return { failed: [...new Set(failed)] };
  },

  async orders(db, cfg, since) {
    const out: ShopOrder[] = [];
    let after: string | null = null;
    const query = `created_at:>='${since.toISOString()}' status:open -financial_status:voided`;
    for (let i = 0; i < 100; i++) {
      const d: { orders: Page<Order> } = await gql(db, cfg, "orders", ORDERS, { after, query });
      for (const o of d.orders.nodes) {
        const a = o.billingAddress;
        out.push({
          externalId: o.id,
          number: o.name,
          createdAt: new Date(o.createdAt),
          currency: o.currencyCode,
          pricesIncludeVat: o.taxesIncluded,
          customer: {
            name: a?.company || a?.name || o.email || `Клиент от Shopify ${o.name}`,
            email: o.email,
            phone: o.phone ?? a?.phone ?? null,
            address: a ? [a.address1, a.address2, a.zip, a.city].filter(Boolean).join(", ") || null : null,
          },
          lines: o.lineItems.nodes.map((l) => ({ sku: l.sku, name: l.name, quantity: l.quantity, unitPrice: parseMoney(l.originalUnitPriceSet.shopMoney.amount) })),
        });
      }
      if (!d.orders.pageInfo.hasNextPage) break;
      after = d.orders.pageInfo.endCursor;
    }
    return out;
  },
};
