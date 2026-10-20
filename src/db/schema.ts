import { relations, sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Enumerations (stored as text so they stay readable in the database)
// ---------------------------------------------------------------------------
export const FIELD_TYPES = ["text", "number", "date", "select", "boolean"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const ITEM_STATUSES = ["active", "archived"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const MOVEMENT_TYPES = ["in", "out", "adjust"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const SHIPMENT_DIRECTIONS = ["inbound", "outbound"] as const;
export type ShipmentDirection = (typeof SHIPMENT_DIRECTIONS)[number];

export const SHIPMENT_STATUSES = [
  "pending",
  "in_transit",
  "delivered",
  "cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const EVENT_TYPES = ["event", "reminder", "deadline"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const timestamp = (name: string) =>
  text(name).notNull().default(sql`(current_timestamp)`);

// ---------------------------------------------------------------------------
// Categories + dynamic field definitions (what makes the system "universal")
// ---------------------------------------------------------------------------
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at"),
});

export const fieldDefinitions = sqliteTable("field_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: FIELD_TYPES }).notNull().default("text"),
  /** JSON array of allowed values for `select` fields. */
  options: text("options"),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Items and their stock
// ---------------------------------------------------------------------------
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  quantity: integer("quantity").notNull().default(0),
  minQuantity: integer("min_quantity").notNull().default(0),
  unit: text("unit").notNull().default("бр."),
  unitCost: real("unit_cost").notNull().default(0),
  unitPrice: real("unit_price").notNull().default(0),
  location: text("location"),
  status: text("status", { enum: ITEM_STATUSES }).notNull().default("active"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const itemFieldValues = sqliteTable(
  "item_field_values",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    fieldId: integer("field_id")
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    value: text("value").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.fieldId] })],
);

export const stockMovements = sqliteTable("stock_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  type: text("type", { enum: MOVEMENT_TYPES }).notNull(),
  /** Signed delta applied to the item quantity. */
  delta: integer("delta").notNull(),
  quantityAfter: integer("quantity_after").notNull(),
  reason: text("reason"),
  shipmentId: integer("shipment_id").references(() => shipments.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at"),
});

// ---------------------------------------------------------------------------
// Shipments
// ---------------------------------------------------------------------------
export const shipments = sqliteTable("shipments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  direction: text("direction", { enum: SHIPMENT_DIRECTIONS }).notNull(),
  status: text("status", { enum: SHIPMENT_STATUSES })
    .notNull()
    .default("pending"),
  /** Supplier (inbound) or customer (outbound). */
  partner: text("partner"),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  /** ISO date (YYYY-MM-DD). */
  expectedDate: text("expected_date"),
  deliveredAt: text("delivered_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at"),
});

export const shipmentLines = sqliteTable("shipment_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shipmentId: integer("shipment_id")
    .notNull()
    .references(() => shipments.id, { onDelete: "cascade" }),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
});

// ---------------------------------------------------------------------------
// Collections (free grouping of items: a kit, a display, a season, ...)
// ---------------------------------------------------------------------------
export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#0ea5e9"),
  createdAt: timestamp("created_at"),
});

export const collectionItems = sqliteTable(
  "collection_items",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at"),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.itemId] })],
);

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
export const calendarEvents = sqliteTable("calendar_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  /** ISO date (YYYY-MM-DD). */
  date: text("date").notNull(),
  type: text("type", { enum: EVENT_TYPES }).notNull().default("event"),
  notes: text("notes"),
  createdAt: timestamp("created_at"),
});

// ---------------------------------------------------------------------------
// Settings (key/value)
// ---------------------------------------------------------------------------
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const categoriesRelations = relations(categories, ({ many }) => ({
  fields: many(fieldDefinitions),
  items: many(items),
}));

export const fieldDefinitionsRelations = relations(fieldDefinitions, ({ one, many }) => ({
  category: one(categories, {
    fields: [fieldDefinitions.categoryId],
    references: [categories.id],
  }),
  values: many(itemFieldValues),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  category: one(categories, {
    fields: [items.categoryId],
    references: [categories.id],
  }),
  fieldValues: many(itemFieldValues),
  movements: many(stockMovements),
  collectionItems: many(collectionItems),
  shipmentLines: many(shipmentLines),
}));

export const itemFieldValuesRelations = relations(itemFieldValues, ({ one }) => ({
  item: one(items, { fields: [itemFieldValues.itemId], references: [items.id] }),
  field: one(fieldDefinitions, {
    fields: [itemFieldValues.fieldId],
    references: [fieldDefinitions.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  item: one(items, { fields: [stockMovements.itemId], references: [items.id] }),
  shipment: one(shipments, {
    fields: [stockMovements.shipmentId],
    references: [shipments.id],
  }),
}));

export const shipmentsRelations = relations(shipments, ({ many }) => ({
  lines: many(shipmentLines),
  movements: many(stockMovements),
}));

export const shipmentLinesRelations = relations(shipmentLines, ({ one }) => ({
  shipment: one(shipments, {
    fields: [shipmentLines.shipmentId],
    references: [shipments.id],
  }),
  item: one(items, { fields: [shipmentLines.itemId], references: [items.id] }),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  collectionItems: many(collectionItems),
}));

export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionItems.collectionId],
    references: [collections.id],
  }),
  item: one(items, { fields: [collectionItems.itemId], references: [items.id] }),
}));

// Convenience row types
export type Category = typeof categories.$inferSelect;
export type FieldDefinition = typeof fieldDefinitions.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemFieldValue = typeof itemFieldValues.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type ShipmentLine = typeof shipmentLines.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
