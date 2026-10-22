import "server-only";
import { UserError } from "../../errors";
import { parseMoney, unitCostOf } from "../../money";
import { http, type IntegrationConfig } from "../core";
import type { Shop, ShopOrder, ShopProduct, StockUpdate } from "./types";

/**
 * WooCommerce REST API v3 (`/wp-json/wc/v3`), ключове consumer key/secret през BASIC (само HTTPS).
 * Наличност: products/batch и products/{id}/variations/batch (до 100 на заявка).
 */
const PAGE = 100;

function base(cfg: IntegrationConfig) {
  const url = (cfg.settings.url ?? "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) throw new UserError("WooCommerce: попълнете адреса на магазина (https://…).");
  if (!cfg.credentials.consumerKey || !cfg.credentials.consumerSecret) throw new UserError("WooCommerce: попълнете consumer key и secret.");
  return `${url}/wp-json/wc/v3`;
}

const headers = (cfg: IntegrationConfig) => ({
  Authorization: `Basic ${Buffer.from(`${cfg.credentials.consumerKey}:${cfg.credentials.consumerSecret}`).toString("base64")}`,
  "Content-Type": "application/json",
});

async function call<T>(db: Parameters<Shop["products"]>[0], cfg: IntegrationConfig, action: string, path: string, init: RequestInit = {}) {
  const r = await http(db, "woocommerce", action, `${base(cfg)}${path}`, { ...init, headers: headers(cfg) });
  if (r.status >= 400) {
    const b = r.body as { message?: string } | null;
    throw new UserError(`WooCommerce: ${b?.message ?? `HTTP ${r.status}`}`);
  }
  return r.body as T;
}

/** Всички страници на списък (спира на празна или непълна страница). */
async function all<T>(db: Parameters<Shop["products"]>[0], cfg: IntegrationConfig, action: string, path: string) {
  const out: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const rows = await call<T[]>(db, cfg, action, `${path}${path.includes("?") ? "&" : "?"}per_page=${PAGE}&page=${page}`);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

type WooProduct = { id: number; name: string; sku: string; type: string; variations?: number[] };
type WooVariation = { id: number; sku: string; name?: string };
type WooLine = { sku: string | null; name: string; quantity: number; subtotal: string; subtotal_tax: string };
type WooOrder = {
  id: number;
  number: string;
  date_created_gmt: string;
  currency: string;
  billing: { first_name: string; last_name: string; company: string; email: string; phone: string; address_1: string; address_2: string; city: string; postcode: string };
  line_items: WooLine[];
};

export const woocommerce: Shop = {
  async products(db, cfg) {
    const out: ShopProduct[] = [];
    for (const p of await all<WooProduct>(db, cfg, "products", "/products?status=any")) {
      if (p.type === "variable") {
        for (const v of await all<WooVariation>(db, cfg, "variations", `/products/${p.id}/variations`)) if (v.sku) out.push({ sku: v.sku, externalId: String(p.id), variantId: String(v.id), name: `${p.name} ${v.name ?? ""}`.trim() });
      } else if (p.sku) out.push({ sku: p.sku, externalId: String(p.id), variantId: null, name: p.name });
    }
    return out;
  },

  async pushStock(db, cfg, updates) {
    const failed: string[] = [];
    const groups = new Map<string, StockUpdate[]>(); // "" = прости продукти, иначе родителят на вариантите
    for (const u of updates) groups.set(u.variantId ? u.externalId : "", [...(groups.get(u.variantId ? u.externalId : "") ?? []), u]);
    for (const [parent, rows] of groups) {
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const path = parent ? `/products/${parent}/variations/batch` : "/products/batch";
        const body = { update: chunk.map((u) => ({ id: Number(u.variantId ?? u.externalId), manage_stock: true, stock_quantity: Math.floor(u.quantity) })) };
        try {
          const r = await call<{ update?: Array<{ id: number; error?: unknown }> }>(db, cfg, "stock", path, { method: "POST", body: JSON.stringify(body) });
          const bad = new Set((r.update ?? []).filter((x) => x.error).map((x) => String(x.id)));
          for (const u of chunk) if (bad.has(u.variantId ?? u.externalId)) failed.push(u.sku);
        } catch {
          failed.push(...chunk.map((u) => u.sku));
        }
      }
    }
    return { failed };
  },

  async orders(db, cfg, since) {
    const statuses = (cfg.settings.importStatuses || "processing").split(/[\s,]+/).filter(Boolean).join(",");
    const rows = await all<WooOrder>(db, cfg, "orders", `/orders?status=${encodeURIComponent(statuses)}&after=${encodeURIComponent(since.toISOString())}&orderby=date&order=asc`);
    return rows.map((o): ShopOrder => {
      const b = o.billing;
      const person = `${b.first_name} ${b.last_name}`.trim();
      return {
        externalId: String(o.id),
        number: o.number,
        createdAt: new Date(`${o.date_created_gmt}Z`),
        currency: o.currency,
        pricesIncludeVat: false, // subtotal е без данък
        customer: {
          name: b.company || person || b.email || `Клиент от WooCommerce #${o.number}`,
          email: b.email || null,
          phone: b.phone || null,
          address: [b.address_1, b.address_2, b.postcode, b.city].filter(Boolean).join(", ") || null,
        },
        lines: o.line_items.map((l) => ({ sku: l.sku || null, name: l.name, quantity: l.quantity, unitPrice: unitCostOf(parseMoney(l.subtotal), l.quantity) })),
      };
    });
  },
};
