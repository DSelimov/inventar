import "server-only";
import type { ProviderId } from "../core";
import { shopify } from "./shopify";
import type { Shop } from "./types";
import { woocommerce } from "./woocommerce";

export const SHOPS = { woocommerce, shopify } satisfies Partial<Record<ProviderId, Shop>>;
export type ShopId = keyof typeof SHOPS;
export const isShop = (p: string): p is ShopId => p in SHOPS;
