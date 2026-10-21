/**
 * СХЕМА НА ЕДНА КЛИЕНТСКА БАЗА. Всяка организация има собствена MySQL база с тези таблици.
 * Потребителите живеят в контролната база, затова тук се пазят само user_id + име (снимка).
 */
import { relations, sql } from "drizzle-orm";
import { boolean, date, datetime, decimal, index, int, json, mysqlEnum, mysqlTable, primaryKey, text, tinyint, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

// ---------------------------------------------------------------- enumerations
export const FIELD_TYPES = ["text", "number", "date", "select", "boolean"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const ITEM_STATUSES = ["active", "archived"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const TRACKING_MODES = ["none", "lot", "serial"] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];
export const MOVEMENT_TYPES = ["in", "out", "adjust", "transfer_in", "transfer_out", "write_off"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const SHIPMENT_DIRECTIONS = ["inbound", "outbound"] as const;
export type ShipmentDirection = (typeof SHIPMENT_DIRECTIONS)[number];
export const SHIPMENT_STATUSES = ["pending", "in_transit", "delivered", "cancelled"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export const PARTNER_TYPES = ["supplier", "customer", "both"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];
export const ORDER_TYPES = ["purchase", "sales"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export const ORDER_STATUSES = ["draft", "confirmed", "partial", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const EVENT_TYPES = ["event", "reminder", "deadline"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const API_SCOPES = ["read", "write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const WEBHOOK_EVENTS = [
  "item.created",
  "item.updated",
  "item.low_stock",
  "movement.created",
  "shipment.created",
  "shipment.status_changed",
  "order.created",
  "order.status_changed",
  "invoice.issued",
  "invoice.paid",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Пари: точно в базата (decimal), число в TypeScript; аритметиката е в src/lib/money.ts. */
const money = (name: string) => decimal(name, { precision: 14, scale: 4, mode: "number" });
/** Стойност (количество × цена), закръглена до стотинка. */
const amount = (name: string) => decimal(name, { precision: 14, scale: 2, mode: "number" });
/** Количества: до 3 знака (кг, л, м), точно в базата; аритметиката е в src/lib/quantity.ts. */
const qty = (name: string) => decimal(name, { precision: 14, scale: 3, mode: "number" });
const createdAt = () => datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const ts = (name: string) => datetime(name, { fsp: 3 });

// ------------------------------------------------------------------- locations
export const locations = mysqlTable("locations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 32 }),
  address: varchar("address", { length: 500 }),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ------------------------------------------------------------------- vat rates
/** Ставки ДДС на организацията (по подразбиране 20 %, 9 %, 0 % и без ДДС); основанието се печата при 0 %. */
export const vatRates = mysqlTable("vat_rates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  rate: decimal("rate", { precision: 5, scale: 2, mode: "number" }).notNull(),
  /** Правно основание за неначисляване (чл. от ЗДДС) — задължително при 0 %. */
  legalBasis: varchar("legal_basis", { length: 255 }),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: int("sort_order").notNull().default(0),
});

// ------------------------------------------------------------------ categories
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).notNull().default("#6366f1"),
  /** ДДС по подразбиране за артикулите в категорията; празно = ставката по подразбиране. */
  vatRateId: int("vat_rate_id").references(() => vatRates.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const fieldDefinitions = mysqlTable("field_definitions", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  type: mysqlEnum("type", FIELD_TYPES).notNull().default("text"),
  /** JSON масив от допустими стойности за select. */
  options: text("options"),
  required: boolean("required").notNull().default(false),
  sortOrder: int("sort_order").notNull().default(0),
});

// ----------------------------------------------------------------------- items
export const items = mysqlTable(
  "items",
  {
    id: int("id").autoincrement().primaryKey(),
    sku: varchar("sku", { length: 64 }).notNull(),
    barcode: varchar("barcode", { length: 64 }),
    name: varchar("name", { length: 300 }).notNull(),
    description: text("description"),
    categoryId: int("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** ДДС на артикула; празно = от категорията, после ставката по подразбиране. */
    vatRateId: int("vat_rate_id").references(() => vatRates.id, { onDelete: "set null" }),
    parentId: int("parent_id"),
    variantLabel: varchar("variant_label", { length: 120 }),
    tracking: mysqlEnum("tracking", TRACKING_MODES).notNull().default("none"),
    /** Кеширана обща наличност във всички локации; поддържа се от applyMovement. */
    quantity: qty("quantity").notNull().default(0),
    minQuantity: qty("min_quantity").notNull().default(0),
    unit: varchar("unit", { length: 32 }).notNull().default("бр."),
    /** Знаци след запетаята за количествата: 0 = бройки, 1–3 = кг/л/м… Серийните номера са винаги 0. */
    quantityDecimals: tinyint("quantity_decimals").notNull().default(0),
    unitCost: money("unit_cost").notNull().default(0),
    unitPrice: money("unit_price").notNull().default(0),
    status: mysqlEnum("status", ITEM_STATUSES).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [uniqueIndex("items_sku").on(t.sku), index("items_barcode").on(t.barcode), index("items_parent").on(t.parentId)],
);

/** Снимки на артикул. Файловете са в хранилището (src/lib/storage.ts) под storageKey + "-full.webp" / "-thumb.webp". */
export const itemImages = mysqlTable(
  "item_images",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    /** Общ размер на двата файла в байтове. */
    sizeBytes: int("size_bytes").notNull(),
    /** Най-малкият е главната снимка. */
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("item_images_item").on(t.itemId, t.sortOrder)],
);

export const itemFieldValues = mysqlTable(
  "item_field_values",
  {
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    fieldId: int("field_id").notNull().references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.fieldId] })],
);

export const stockLevels = mysqlTable(
  "stock_levels",
  {
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    locationId: int("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    quantity: qty("quantity").notNull().default(0),
    minQuantity: qty("min_quantity").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.locationId] })],
);

export const lots = mysqlTable(
  "lots",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    locationId: int("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    lotNumber: varchar("lot_number", { length: 120 }).notNull(),
    serialNumber: varchar("serial_number", { length: 120 }),
    expiryDate: date("expiry_date", { mode: "string" }),
    quantity: qty("quantity").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("lots_item_loc").on(t.itemId, t.locationId)],
);

export const stockMovements = mysqlTable(
  "stock_movements",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    locationId: int("location_id").references(() => locations.id, { onDelete: "set null" }),
    lotId: int("lot_id").references(() => lots.id, { onDelete: "set null" }),
    /** Потребител от контролната база (без FK) + име към момента. */
    userId: int("user_id"),
    userName: varchar("user_name", { length: 200 }),
    type: mysqlEnum("type", MOVEMENT_TYPES).notNull(),
    delta: qty("delta").notNull(),
    quantityAfter: qty("quantity_after").notNull(),
    /** Себестойност за единица по метода на оценка (средна или FIFO) и стойността на движението (delta × цена, ±). */
    unitCost: money("unit_cost").notNull().default(0),
    value: amount("value").notNull().default(0),
    reason: varchar("reason", { length: 500 }),
    shipmentId: int("shipment_id").references(() => shipments.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("movements_created").on(t.createdAt), index("movements_item").on(t.itemId)],
);

// -------------------------------------------------------------------- partners
export const partners = mysqlTable("partners", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", PARTNER_TYPES).notNull().default("both"),
  name: varchar("name", { length: 200 }).notNull(),
  contactName: varchar("contact_name", { length: 200 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 64 }),
  address: varchar("address", { length: 500 }),
  /** ЕИК (9 цифри) или ЕГН/БУЛСТАТ (10 или 13 цифри). */
  eik: varchar("eik", { length: 13 }),
  /** ДДС номер (BG + ЕИК за български регистрирани лица, иначе с кода на държавата). */
  vatNumber: varchar("vat_number", { length: 32 }),
  vatRegistered: boolean("vat_registered").notNull().default(false),
  /** Последна проверка на ДДС номера във VIES: true/false; null = не е проверяван или услугата не отговори. */
  viesValid: boolean("vies_valid"),
  viesCheckedAt: ts("vies_checked_at"),
  /** Държава по ISO 3166-1 alpha-2; ЕС/извън ЕС определя 0 % и обратното начисляване. */
  country: varchar("country", { length: 2 }).notNull().default("BG"),
  leadTimeDays: int("lead_time_days"),
  notes: text("notes"),
  createdAt: createdAt(),
});

/** Опаковки на артикул (кашон = 12 бр., палет = 48 кашона в бр.): фактор в основната мерна единица и баркод. */
export const itemUnits = mysqlTable(
  "item_units",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    factor: qty("factor").notNull(),
    barcode: varchar("barcode", { length: 64 }),
  },
  (t) => [uniqueIndex("item_units_barcode").on(t.barcode)],
);

/** Доставчици на артикул: код и цена при доставчика, минимално количество, срок; един е предпочитан. */
export const itemSuppliers = mysqlTable(
  "item_suppliers",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    partnerId: int("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    supplierSku: varchar("supplier_sku", { length: 64 }),
    purchasePrice: money("purchase_price"),
    minOrderQuantity: qty("min_order_quantity"),
    leadTimeDays: int("lead_time_days"),
    preferred: boolean("preferred").notNull().default(false),
  },
  (t) => [uniqueIndex("item_suppliers_item_partner").on(t.itemId, t.partnerId)],
);

// ---------------------------------------------------------------------- orders
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ORDER_TYPES).notNull(),
  number: varchar("number", { length: 64 }).notNull(),
  partnerId: int("partner_id").references(() => partners.id, { onDelete: "set null" }),
  locationId: int("location_id").references(() => locations.id, { onDelete: "set null" }),
  status: mysqlEnum("status", ORDER_STATUSES).notNull().default("draft"),
  orderDate: date("order_date", { mode: "string" }),
  expectedDate: date("expected_date", { mode: "string" }),
  notes: text("notes"),
  /** Цените на редовете са с ДДС (снимка на настройката при създаване). */
  pricesIncludeVat: boolean("prices_include_vat").notNull().default(false),
  /** Валутата, в която е издадена поръчката, ако е превалутирана (напр. BGN → EUR от 1.1.2026). */
  originalCurrency: varchar("original_currency", { length: 3 }),
  createdBy: int("created_by"),
  createdAt: createdAt(),
});

export const orderLines = mysqlTable("order_lines", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  quantity: qty("quantity").notNull(),
  fulfilledQuantity: qty("fulfilled_quantity").notNull().default(0),
  /** Върнато от клиента (продажба) или към доставчика (доставка) след изпълнение. */
  returnedQuantity: qty("returned_quantity").notNull().default(0),
  unitPrice: money("unit_price").notNull().default(0),
  /** Цената в originalCurrency на поръчката преди превалутирането. */
  originalUnitPrice: money("original_unit_price"),
  /** ДДС към момента на записа (снимка на ставката); сумите се смятат с lineAmounts от src/lib/vat.ts. */
  vatRateId: int("vat_rate_id").references(() => vatRates.id, { onDelete: "set null" }),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(20),
});

// ------------------------------------------------------------------- shipments
export const shipments = mysqlTable("shipments", {
  id: int("id").autoincrement().primaryKey(),
  reference: varchar("reference", { length: 120 }).notNull(),
  direction: mysqlEnum("direction", SHIPMENT_DIRECTIONS).notNull(),
  status: mysqlEnum("status", SHIPMENT_STATUSES).notNull().default("pending"),
  locationId: int("location_id").references(() => locations.id, { onDelete: "set null" }),
  orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
  partnerId: int("partner_id").references(() => partners.id, { onDelete: "set null" }),
  /** Връщане: входяща от клиент (към продажба) или изходяща към доставчик (към доставка). */
  isReturn: boolean("is_return").notNull().default(false),
  partner: varchar("partner", { length: 200 }),
  carrier: varchar("carrier", { length: 120 }),
  trackingNumber: varchar("tracking_number", { length: 120 }),
  expectedDate: date("expected_date", { mode: "string" }),
  deliveredAt: ts("delivered_at"),
  notes: text("notes"),
  createdBy: int("created_by"),
  createdAt: createdAt(),
});

export const shipmentLines = mysqlTable("shipment_lines", {
  id: int("id").autoincrement().primaryKey(),
  shipmentId: int("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  quantity: qty("quantity").notNull(),
  lotNumber: text("lot_number"),
  expiryDate: date("expiry_date", { mode: "string" }),
  lotId: int("lot_id").references(() => lots.id, { onDelete: "set null" }),
  /** Доставна цена при входяща пратка; празно = от поръчката или от артикула. */
  unitCost: money("unit_cost"),
});

// ----------------------------------------------------------------- cost layers
/** FIFO: всеки приход е слой с остатък; разходите изчерпват най-старите слоеве (само при метод fifo). */
export const costLayers = mysqlTable(
  "cost_layers",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    movementId: int("movement_id").references(() => stockMovements.id, { onDelete: "set null" }),
    /** Поръчката на прихода — връщане към доставчик изписва първо от нейните слоеве. */
    orderId: int("order_id"),
    originalQuantity: qty("original_quantity").notNull(),
    quantity: qty("quantity").notNull(),
    unitCost: money("unit_cost").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("cost_layers_item").on(t.itemId, t.id)],
);

// ----------------------------------------------------------------- collections
export const collections = mysqlTable("collections", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).notNull().default("#0ea5e9"),
  createdAt: createdAt(),
});

export const collectionItems = mysqlTable(
  "collection_items",
  {
    collectionId: int("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    addedAt: ts("added_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.itemId] })],
);

// -------------------------------------------------------------------- calendar
export const calendarEvents = mysqlTable(
  "calendar_events",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 300 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    type: mysqlEnum("type", EVENT_TYPES).notNull().default("event"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("events_date").on(t.date)],
);

// --------------------------------------------- settings, api keys, webhooks, audit
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
});

export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  prefix: varchar("prefix", { length: 16 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  scopes: json("scopes").$type<ApiScope[]>().notNull(),
  lastUsedAt: ts("last_used_at"),
  createdBy: int("created_by"),
  createdAt: createdAt(),
});

export const webhooks = mysqlTable("webhooks", {
  id: int("id").autoincrement().primaryKey(),
  url: varchar("url", { length: 1000 }).notNull(),
  secret: varchar("secret", { length: 128 }).notNull(),
  events: json("events").$type<WebhookEvent[]>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const webhookDeliveries = mysqlTable(
  "webhook_deliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    webhookId: int("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 64 }).notNull(),
    payload: json("payload").notNull(),
    statusCode: int("status_code"),
    success: boolean("success").notNull().default(false),
    error: varchar("error", { length: 500 }),
    createdAt: createdAt(),
  },
  (t) => [index("deliveries_webhook").on(t.webhookId)],
);

// --------------------------------------------------------------- инвентаризация
export const COUNT_STATUSES = ["open", "applied", "cancelled"] as const;
export type CountStatus = (typeof COUNT_STATUSES)[number];

/** Инвентаризация на една локация: снимка на очакваните количества, преброено, разлики, прилагане. */
export const stockCounts = mysqlTable("stock_counts", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 64 }).notNull(),
  locationId: int("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  /** Само артикулите от тази категория (по избор). */
  categoryId: int("category_id").references(() => categories.id, { onDelete: "set null" }),
  status: mysqlEnum("status", COUNT_STATUSES).notNull().default("open"),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 200 }),
  createdAt: createdAt(),
  appliedAt: ts("applied_at"),
  appliedBy: varchar("applied_by", { length: 200 }),
});

// ------------------------------------------------------------------ write-offs
export const WRITE_OFF_STATUSES = ["draft", "applied", "cancelled"] as const;
export type WriteOffStatus = (typeof WRITE_OFF_STATUSES)[number];

/** Протокол за брак: стоката се изписва при „Приложи“ (движения write_off по себестойност). */
export const writeOffs = mysqlTable("write_offs", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 64 }).notNull(),
  locationId: int("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", WRITE_OFF_STATUSES).notNull().default("draft"),
  /** Причина: изтекъл срок, повреда, кражба… */
  reason: varchar("reason", { length: 500 }).notNull(),
  /** Членове на комисията, по един на ред — подписват протокола. */
  commission: text("commission"),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 200 }),
  createdAt: createdAt(),
  appliedAt: ts("applied_at"),
  appliedBy: varchar("applied_by", { length: 200 }),
});

export const writeOffLines = mysqlTable("write_off_lines", {
  id: int("id").autoincrement().primaryKey(),
  writeOffId: int("write_off_id").notNull().references(() => writeOffs.id, { onDelete: "cascade" }),
  itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  lotId: int("lot_id").references(() => lots.id, { onDelete: "set null" }),
  quantity: qty("quantity").notNull(),
  /** Себестойност и стойност при прилагане (от движението). */
  unitCost: money("unit_cost"),
  value: amount("value"),
});

// -------------------------------------------------------------------- invoices
export const INVOICE_KINDS = ["invoice", "credit_note", "debit_note", "proforma"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_STATUSES = ["draft", "issued", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Фактура, кредитно/дебитно известие или проформа. Черновата се редактира; при издаване получава номер
 * (10 цифри — общ ред за фактури и известия; проформите — свой) и снимка на данните на доставчика и
 * получателя и на сумите. Издаденият документ не се променя: корекции — с известие, анулиране — с причина.
 */
export const invoices = mysqlTable(
  "invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    kind: mysqlEnum("kind", INVOICE_KINDS).notNull().default("invoice"),
    number: varchar("number", { length: 32 }),
    status: mysqlEnum("status", INVOICE_STATUSES).notNull().default("draft"),
    issueDate: date("issue_date", { mode: "string" }),
    /** Дата на данъчното събитие (доставката); по подразбиране = датата на издаване. */
    taxEventDate: date("tax_event_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    pricesIncludeVat: boolean("prices_include_vat").notNull().default(false),
    paymentMethod: varchar("payment_method", { length: 64 }),
    orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
    /** За известие: фактурата, към която е. */
    relatedInvoiceId: int("related_invoice_id"),
    /** Основание за известие / за анулиране. */
    reason: varchar("reason", { length: 500 }),
    partnerId: int("partner_id").references(() => partners.id, { onDelete: "set null" }),
    // снимка на доставчика и получателя към издаването
    supplierName: varchar("supplier_name", { length: 300 }),
    supplierEik: varchar("supplier_eik", { length: 13 }),
    supplierVatNumber: varchar("supplier_vat_number", { length: 32 }),
    supplierAddress: varchar("supplier_address", { length: 500 }),
    supplierMol: varchar("supplier_mol", { length: 200 }),
    recipientName: varchar("recipient_name", { length: 300 }),
    recipientEik: varchar("recipient_eik", { length: 13 }),
    recipientVatNumber: varchar("recipient_vat_number", { length: 32 }),
    recipientAddress: varchar("recipient_address", { length: 500 }),
    recipientCountry: varchar("recipient_country", { length: 2 }),
    recipientMol: varchar("recipient_mol", { length: 200 }),
    netTotal: amount("net_total").notNull().default(0),
    vatTotal: amount("vat_total").notNull().default(0),
    grossTotal: amount("gross_total").notNull().default(0),
    paidAmount: amount("paid_amount").notNull().default(0),
    paymentStatus: mysqlEnum("payment_status", PAYMENT_STATUSES).notNull().default("unpaid"),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 200 }),
    createdAt: createdAt(),
    issuedAt: ts("issued_at"),
    issuedBy: varchar("issued_by", { length: 200 }),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [uniqueIndex("invoices_number").on(t.kind, t.number), index("invoices_issue_date").on(t.issueDate)],
);

export const invoiceLines = mysqlTable("invoice_lines", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  itemId: int("item_id").references(() => items.id, { onDelete: "set null" }),
  orderLineId: int("order_line_id").references(() => orderLines.id, { onDelete: "set null" }),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: qty("quantity").notNull(),
  unit: varchar("unit", { length: 32 }).notNull().default("бр."),
  unitPrice: money("unit_price").notNull(),
  vatRateId: int("vat_rate_id").references(() => vatRates.id, { onDelete: "set null" }),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2, mode: "number" }).notNull(),
  legalBasis: varchar("legal_basis", { length: 255 }),
  netAmount: amount("net_amount").notNull().default(0),
  vatAmount: amount("vat_amount").notNull().default(0),
  grossAmount: amount("gross_amount").notNull().default(0),
  sortOrder: int("sort_order").notNull().default(0),
});

export const invoicePayments = mysqlTable("invoice_payments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  paidOn: date("paid_on", { mode: "string" }).notNull(),
  amount: amount("amount").notNull(),
  method: varchar("method", { length: 64 }),
  note: varchar("note", { length: 255 }),
  createdBy: varchar("created_by", { length: 200 }),
  createdAt: createdAt(),
});

// ------------------------------------------------------------------------ VIES
/** Кеш на проверките във VIES (системата на ЕС за ДДС номера), за да не се пита при всяко отваряне. */
export const viesChecks = mysqlTable("vies_checks", {
  vatNumber: varchar("vat_number", { length: 32 }).primaryKey(),
  valid: boolean("valid").notNull(),
  name: varchar("name", { length: 300 }),
  address: varchar("address", { length: 500 }),
  checkedAt: datetime("checked_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

// ------------------------------------------------------------ document numbers
/** Поредни номера по вид документ и година: без дупки (броячът се увеличава в транзакцията на документа). */
export const documentCounters = mysqlTable(
  "document_counters",
  {
    docType: varchar("doc_type", { length: 32 }).notNull(),
    year: int("year").notNull(),
    lastNumber: int("last_number").notNull(),
  },
  (t) => [primaryKey({ columns: [t.docType, t.year] })],
);

/** Ред: артикул (или партида/сериен номер при проследяване) с очаквано и преброено количество. */
export const stockCountLines = mysqlTable(
  "stock_count_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    countId: int("count_id").notNull().references(() => stockCounts.id, { onDelete: "cascade" }),
    itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    lotId: int("lot_id").references(() => lots.id, { onDelete: "set null" }),
    /** Номер на партидата към момента (и за нови партиди, открити при броенето). */
    lotNumber: varchar("lot_number", { length: 120 }),
    expected: qty("expected").notNull().default(0),
    /** null = още не е броено */
    counted: qty("counted"),
    countedAt: ts("counted_at"),
  },
  (t) => [index("count_lines_count").on(t.countId)],
);

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id"),
    userName: varchar("user_name", { length: 200 }),
    action: varchar("action", { length: 32 }).notNull(),
    entity: varchar("entity", { length: 32 }).notNull(),
    entityId: int("entity_id"),
    details: json("details"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created").on(t.createdAt)],
);

// ------------------------------------------------------------------- relations
export const locationsRelations = relations(locations, ({ many }) => ({ stockLevels: many(stockLevels) }));
export const vatRatesRelations = relations(vatRates, ({ many }) => ({ items: many(items), categories: many(categories) }));
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  fields: many(fieldDefinitions),
  items: many(items),
  vatRate: one(vatRates, { fields: [categories.vatRateId], references: [vatRates.id] }),
}));
export const fieldDefinitionsRelations = relations(fieldDefinitions, ({ one, many }) => ({
  category: one(categories, { fields: [fieldDefinitions.categoryId], references: [categories.id] }),
  values: many(itemFieldValues),
}));
export const itemsRelations = relations(items, ({ one, many }) => ({
  category: one(categories, { fields: [items.categoryId], references: [categories.id] }),
  vatRate: one(vatRates, { fields: [items.vatRateId], references: [vatRates.id] }),
  parent: one(items, { fields: [items.parentId], references: [items.id], relationName: "variants" }),
  variants: many(items, { relationName: "variants" }),
  fieldValues: many(itemFieldValues),
  images: many(itemImages),
  stockLevels: many(stockLevels),
  lots: many(lots),
  movements: many(stockMovements),
  collectionItems: many(collectionItems),
  shipmentLines: many(shipmentLines),
  orderLines: many(orderLines),
  suppliers: many(itemSuppliers),
  packUnits: many(itemUnits),
}));
export const itemImagesRelations = relations(itemImages, ({ one }) => ({
  item: one(items, { fields: [itemImages.itemId], references: [items.id] }),
}));
export const itemFieldValuesRelations = relations(itemFieldValues, ({ one }) => ({
  item: one(items, { fields: [itemFieldValues.itemId], references: [items.id] }),
  field: one(fieldDefinitions, { fields: [itemFieldValues.fieldId], references: [fieldDefinitions.id] }),
}));
export const stockLevelsRelations = relations(stockLevels, ({ one }) => ({
  item: one(items, { fields: [stockLevels.itemId], references: [items.id] }),
  location: one(locations, { fields: [stockLevels.locationId], references: [locations.id] }),
}));
export const stockCountsRelations = relations(stockCounts, ({ one, many }) => ({
  location: one(locations, { fields: [stockCounts.locationId], references: [locations.id] }),
  category: one(categories, { fields: [stockCounts.categoryId], references: [categories.id] }),
  lines: many(stockCountLines),
}));
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  lines: many(invoiceLines),
  payments: many(invoicePayments),
  order: one(orders, { fields: [invoices.orderId], references: [orders.id] }),
  partner: one(partners, { fields: [invoices.partnerId], references: [partners.id] }),
  related: one(invoices, { fields: [invoices.relatedInvoiceId], references: [invoices.id], relationName: "notes" }),
  notesFor: many(invoices, { relationName: "notes" }),
}));
export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
  item: one(items, { fields: [invoiceLines.itemId], references: [items.id] }),
}));
export const invoicePaymentsRelations = relations(invoicePayments, ({ one }) => ({
  invoice: one(invoices, { fields: [invoicePayments.invoiceId], references: [invoices.id] }),
}));
export const itemUnitsRelations = relations(itemUnits, ({ one }) => ({ item: one(items, { fields: [itemUnits.itemId], references: [items.id] }) }));
export const itemSuppliersRelations = relations(itemSuppliers, ({ one }) => ({
  item: one(items, { fields: [itemSuppliers.itemId], references: [items.id] }),
  partner: one(partners, { fields: [itemSuppliers.partnerId], references: [partners.id] }),
}));
export const writeOffsRelations = relations(writeOffs, ({ one, many }) => ({
  location: one(locations, { fields: [writeOffs.locationId], references: [locations.id] }),
  lines: many(writeOffLines),
}));
export const writeOffLinesRelations = relations(writeOffLines, ({ one }) => ({
  writeOff: one(writeOffs, { fields: [writeOffLines.writeOffId], references: [writeOffs.id] }),
  item: one(items, { fields: [writeOffLines.itemId], references: [items.id] }),
  lot: one(lots, { fields: [writeOffLines.lotId], references: [lots.id] }),
}));
export const stockCountLinesRelations = relations(stockCountLines, ({ one }) => ({
  count: one(stockCounts, { fields: [stockCountLines.countId], references: [stockCounts.id] }),
  item: one(items, { fields: [stockCountLines.itemId], references: [items.id] }),
  lot: one(lots, { fields: [stockCountLines.lotId], references: [lots.id] }),
}));
export const lotsRelations = relations(lots, ({ one }) => ({
  item: one(items, { fields: [lots.itemId], references: [items.id] }),
  location: one(locations, { fields: [lots.locationId], references: [locations.id] }),
}));
export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  item: one(items, { fields: [stockMovements.itemId], references: [items.id] }),
  location: one(locations, { fields: [stockMovements.locationId], references: [locations.id] }),
  lot: one(lots, { fields: [stockMovements.lotId], references: [lots.id] }),
  shipment: one(shipments, { fields: [stockMovements.shipmentId], references: [shipments.id] }),
}));
export const partnersRelations = relations(partners, ({ many }) => ({ orders: many(orders), shipments: many(shipments) }));
export const ordersRelations = relations(orders, ({ one, many }) => ({
  partner: one(partners, { fields: [orders.partnerId], references: [partners.id] }),
  location: one(locations, { fields: [orders.locationId], references: [locations.id] }),
  lines: many(orderLines),
  shipments: many(shipments),
}));
export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
  item: one(items, { fields: [orderLines.itemId], references: [items.id] }),
  vatRateRecord: one(vatRates, { fields: [orderLines.vatRateId], references: [vatRates.id] }),
}));
export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  lines: many(shipmentLines),
  movements: many(stockMovements),
  location: one(locations, { fields: [shipments.locationId], references: [locations.id] }),
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  partnerRecord: one(partners, { fields: [shipments.partnerId], references: [partners.id] }),
}));
export const shipmentLinesRelations = relations(shipmentLines, ({ one }) => ({
  shipment: one(shipments, { fields: [shipmentLines.shipmentId], references: [shipments.id] }),
  item: one(items, { fields: [shipmentLines.itemId], references: [items.id] }),
  lot: one(lots, { fields: [shipmentLines.lotId], references: [lots.id] }),
}));
export const collectionsRelations = relations(collections, ({ many }) => ({ collectionItems: many(collectionItems) }));
export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, { fields: [collectionItems.collectionId], references: [collections.id] }),
  item: one(items, { fields: [collectionItems.itemId], references: [items.id] }),
}));
export const webhooksRelations = relations(webhooks, ({ many }) => ({ deliveries: many(webhookDeliveries) }));
export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhooks, { fields: [webhookDeliveries.webhookId], references: [webhooks.id] }),
}));

// Row types
export type Location = typeof locations.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type FieldDefinition = typeof fieldDefinitions.$inferSelect;
export type Item = typeof items.$inferSelect;
export type StockLevel = typeof stockLevels.$inferSelect;
export type Lot = typeof lots.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type VatRate = typeof vatRates.$inferSelect;
export type ItemSupplier = typeof itemSuppliers.$inferSelect;
export type ItemUnit = typeof itemUnits.$inferSelect;
export type WriteOff = typeof writeOffs.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type ShipmentLine = typeof shipmentLines.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type ItemImage = typeof itemImages.$inferSelect;
export type StockCount = typeof stockCounts.$inferSelect;
export type StockCountLine = typeof stockCountLines.$inferSelect;
