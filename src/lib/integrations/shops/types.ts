import type { Db } from "@/db/tenant";
import type { IntegrationConfig } from "../core";

/** Продукт или вариант в магазина, който има SKU. */
export type ShopProduct = { sku: string; externalId: string; variantId: string | null; name: string };

export type ShopOrderLine = { sku: string | null; name: string; quantity: number; unitPrice: number };
export type ShopOrder = {
  externalId: string;
  number: string;
  createdAt: Date;
  currency: string;
  /** Цените на редовете са с ДДС. */
  pricesIncludeVat: boolean;
  customer: { name: string; email: string | null; phone: string | null; address: string | null };
  lines: ShopOrderLine[];
};

export type StockUpdate = { externalId: string; variantId: string | null; sku: string; quantity: number };

export interface Shop {
  /** Всички продукти/варианти със SKU (за свързване по SKU). */
  products(db: Db, cfg: IntegrationConfig): Promise<ShopProduct[]>;
  /** Задава наличността; връща SKU-тата, които не са приети. */
  pushStock(db: Db, cfg: IntegrationConfig, updates: StockUpdate[]): Promise<{ failed: string[] }>;
  /** Поръчки, създадени след `since`, в статусите за внос. */
  orders(db: Db, cfg: IntegrationConfig, since: Date): Promise<ShopOrder[]>;
}
