/**
 * СХЕМА НА ЕДНА КЛИЕНТСКА БАЗА. Всяка организация има собствена MySQL база с тези таблици.
 * Потребителите живеят в контролната база, затова тук се пазят само user_id + име (снимка).
 */
import { relations, sql } from "drizzle-orm";
import { boolean, date, datetime, double, index, int, json, mysqlEnum, mysqlTable, primaryKey, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

// ---------------------------------------------------------------- enumerations
export const FIELD_TYPES = ["text", "number", "date", "select", "boolean"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const ITEM_STATUSES = ["active", "archived"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const TRACKING_MODES = ["none", "lot", "serial"] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];
export const MOVEMENT_TYPES = ["in", "out", "adjust", "transfer_in", "transfer_out"] as const;
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
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

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

// ------------------------------------------------------------------ categories
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).notNull().default("#6366f1"),
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
    parentId: int("parent_id"),
    variantLabel: varchar("variant_label", { length: 120 }),
    tracking: mysqlEnum("tracking", TRACKING_MODES).notNull().default("none"),
    /** Кеширана обща наличност във всички локации; поддържа се от applyMovement. */
    quantity: int("quantity").notNull().default(0),
    minQuantity: int("min_quantity").notNull().default(0),
    unit: varchar("unit", { length: 32 }).notNull().default("бр."),
    unitCost: double("unit_cost").notNull().default(0),
    unitPrice: double("unit_price").notNull().default(0),
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
    quantity: int("quantity").notNull().default(0),
    minQuantity: int("min_quantity").notNull().default(0),
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
    quantity: int("quantity").notNull().default(0),
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
    delta: int("delta").notNull(),
    quantityAfter: int("quantity_after").notNull(),
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
  vatNumber: varchar("vat_number", { length: 32 }),
  leadTimeDays: int("lead_time_days"),
  notes: text("notes"),
  createdAt: createdAt(),
});

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
  createdBy: int("created_by"),
  createdAt: createdAt(),
});

export const orderLines = mysqlTable("order_lines", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  itemId: int("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  quantity: int("quantity").notNull(),
  fulfilledQuantity: int("fulfilled_quantity").notNull().default(0),
  unitPrice: double("unit_price").notNull().default(0),
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
  quantity: int("quantity").notNull(),
  lotNumber: text("lot_number"),
  expiryDate: date("expiry_date", { mode: "string" }),
  lotId: int("lot_id").references(() => lots.id, { onDelete: "set null" }),
});

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
export const categoriesRelations = relations(categories, ({ many }) => ({ fields: many(fieldDefinitions), items: many(items) }));
export const fieldDefinitionsRelations = relations(fieldDefinitions, ({ one, many }) => ({
  category: one(categories, { fields: [fieldDefinitions.categoryId], references: [categories.id] }),
  values: many(itemFieldValues),
}));
export const itemsRelations = relations(items, ({ one, many }) => ({
  category: one(categories, { fields: [items.categoryId], references: [categories.id] }),
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
export type Shipment = typeof shipments.$inferSelect;
export type ShipmentLine = typeof shipmentLines.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type ItemImage = typeof itemImages.$inferSelect;
