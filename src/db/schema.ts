import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------
export const ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const roleEnum = pgEnum("role", ROLES);

export const FIELD_TYPES = ["text", "number", "date", "select", "boolean"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const fieldTypeEnum = pgEnum("field_type", FIELD_TYPES);

export const ITEM_STATUSES = ["active", "archived"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const itemStatusEnum = pgEnum("item_status", ITEM_STATUSES);

export const TRACKING_MODES = ["none", "lot", "serial"] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];
export const trackingEnum = pgEnum("tracking_mode", TRACKING_MODES);

export const MOVEMENT_TYPES = ["in", "out", "adjust", "transfer_in", "transfer_out"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const movementTypeEnum = pgEnum("movement_type", MOVEMENT_TYPES);

export const SHIPMENT_DIRECTIONS = ["inbound", "outbound"] as const;
export type ShipmentDirection = (typeof SHIPMENT_DIRECTIONS)[number];
export const shipmentDirectionEnum = pgEnum("shipment_direction", SHIPMENT_DIRECTIONS);

export const SHIPMENT_STATUSES = ["pending", "in_transit", "delivered", "cancelled"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export const shipmentStatusEnum = pgEnum("shipment_status", SHIPMENT_STATUSES);

export const PARTNER_TYPES = ["supplier", "customer", "both"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];
export const partnerTypeEnum = pgEnum("partner_type", PARTNER_TYPES);

export const ORDER_TYPES = ["purchase", "sales"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export const orderTypeEnum = pgEnum("order_type", ORDER_TYPES);

export const ORDER_STATUSES = ["draft", "confirmed", "partial", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);

export const EVENT_TYPES = ["event", "reminder", "deadline"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const eventTypeEnum = pgEnum("event_type", EVENT_TYPES);

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

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Tenancy, users, sessions
// ---------------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  currency: text("currency").notNull().default("EUR"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("staff"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_user_org").on(t.userId, t.organizationId)],
);

export const sessions = pgTable("sessions", {
  /** sha256 of the cookie token */
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Locations (warehouses, shops, shelves)
// ---------------------------------------------------------------------------
export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    address: text("address"),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("locations_org").on(t.organizationId)],
);

// ---------------------------------------------------------------------------
// Categories + dynamic field definitions
// ---------------------------------------------------------------------------
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#6366f1"),
    createdAt: createdAt(),
  },
  (t) => [index("categories_org").on(t.organizationId)],
);

export const fieldDefinitions = pgTable("field_definitions", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: fieldTypeEnum("type").notNull().default("text"),
  /** JSON array of allowed values for `select` fields. */
  options: text("options"),
  required: boolean("required").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Items, stock per location, lots/serials
// ---------------------------------------------------------------------------
export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** Variant support: child items point to their parent; label like "L / Черен". */
    parentId: integer("parent_id"),
    variantLabel: text("variant_label"),
    tracking: trackingEnum("tracking").notNull().default("none"),
    /** Cached total across all locations; maintained by applyMovement. */
    quantity: integer("quantity").notNull().default(0),
    minQuantity: integer("min_quantity").notNull().default(0),
    unit: text("unit").notNull().default("бр."),
    unitCost: doublePrecision("unit_cost").notNull().default(0),
    unitPrice: doublePrecision("unit_price").notNull().default(0),
    status: itemStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("items_org_sku").on(t.organizationId, t.sku),
    index("items_org_barcode").on(t.organizationId, t.barcode),
    index("items_parent").on(t.parentId),
  ],
);

export const itemFieldValues = pgTable(
  "item_field_values",
  {
    itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    fieldId: integer("field_id").notNull().references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    value: text("value").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.fieldId] })],
);

export const stockLevels = pgTable(
  "stock_levels",
  {
    itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
    minQuantity: integer("min_quantity").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.locationId] })],
);

export const lots = pgTable(
  "lots",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    lotNumber: text("lot_number").notNull(),
    /** Set for serial-tracked items; quantity is then 0 or 1. */
    serialNumber: text("serial_number"),
    expiryDate: date("expiry_date", { mode: "string" }),
    quantity: integer("quantity").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("lots_item_loc").on(t.itemId, t.locationId)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
    lotId: integer("lot_id").references(() => lots.id, { onDelete: "set null" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    type: movementTypeEnum("type").notNull(),
    /** Signed delta applied to the item total. */
    delta: integer("delta").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    reason: text("reason"),
    shipmentId: integer("shipment_id").references(() => shipments.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("movements_org_created").on(t.organizationId, t.createdAt), index("movements_item").on(t.itemId)],
);

// ---------------------------------------------------------------------------
// Partners (suppliers / customers) and orders
// ---------------------------------------------------------------------------
export const partners = pgTable(
  "partners",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    type: partnerTypeEnum("type").notNull().default("both"),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    vatNumber: text("vat_number"),
    leadTimeDays: integer("lead_time_days"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("partners_org").on(t.organizationId)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    type: orderTypeEnum("type").notNull(),
    number: text("number").notNull(),
    partnerId: integer("partner_id").references(() => partners.id, { onDelete: "set null" }),
    locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
    status: orderStatusEnum("status").notNull().default("draft"),
    orderDate: date("order_date", { mode: "string" }),
    expectedDate: date("expected_date", { mode: "string" }),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("orders_org").on(t.organizationId)],
);

export const orderLines = pgTable("order_lines", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  fulfilledQuantity: integer("fulfilled_quantity").notNull().default(0),
  unitPrice: doublePrecision("unit_price").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Shipments
// ---------------------------------------------------------------------------
export const shipments = pgTable(
  "shipments",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    direction: shipmentDirectionEnum("direction").notNull(),
    status: shipmentStatusEnum("status").notNull().default("pending"),
    locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    partnerId: integer("partner_id").references(() => partners.id, { onDelete: "set null" }),
    /** Free-text fallback when no partner record is linked. */
    partner: text("partner"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    expectedDate: date("expected_date", { mode: "string" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("shipments_org").on(t.organizationId)],
);

export const shipmentLines = pgTable("shipment_lines", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  /** Inbound, lot/serial tracked: lot (or serial) number to create on delivery. */
  lotNumber: text("lot_number"),
  expiryDate: date("expiry_date", { mode: "string" }),
  /** Outbound, lot tracked: which lot to take from. */
  lotId: integer("lot_id").references(() => lots.id, { onDelete: "set null" }),
});

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------
export const collections = pgTable(
  "collections",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#0ea5e9"),
    createdAt: createdAt(),
  },
  (t) => [index("collections_org").on(t.organizationId)],
);

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.itemId] })],
);

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    type: eventTypeEnum("type").notNull().default("event"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("events_org_date").on(t.organizationId, t.date)],
);

// ---------------------------------------------------------------------------
// Settings (key/value per organization), API keys, webhooks, audit log
// ---------------------------------------------------------------------------
export const settings = pgTable(
  "settings",
  {
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.key] })],
);

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** First 8 chars shown in the UI. */
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: text("scopes").array().notNull().default(sql`'{read}'::text[]`),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull().default(sql`'{}'::text[]`),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: serial("id").primaryKey(),
    webhookId: integer("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    statusCode: integer("status_code"),
    success: boolean("success").notNull().default(false),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("deliveries_webhook").on(t.webhookId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: integer("entity_id"),
    details: jsonb("details"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_created").on(t.organizationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  locations: many(locations),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  organization: one(organizations, { fields: [memberships.organizationId], references: [organizations.id] }),
}));

export const locationsRelations = relations(locations, ({ many }) => ({
  stockLevels: many(stockLevels),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  fields: many(fieldDefinitions),
  items: many(items),
}));

export const fieldDefinitionsRelations = relations(fieldDefinitions, ({ one, many }) => ({
  category: one(categories, { fields: [fieldDefinitions.categoryId], references: [categories.id] }),
  values: many(itemFieldValues),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  category: one(categories, { fields: [items.categoryId], references: [categories.id] }),
  parent: one(items, { fields: [items.parentId], references: [items.id], relationName: "variants" }),
  variants: many(items, { relationName: "variants" }),
  fieldValues: many(itemFieldValues),
  stockLevels: many(stockLevels),
  lots: many(lots),
  movements: many(stockMovements),
  collectionItems: many(collectionItems),
  shipmentLines: many(shipmentLines),
  orderLines: many(orderLines),
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
  user: one(users, { fields: [stockMovements.userId], references: [users.id] }),
  shipment: one(shipments, { fields: [stockMovements.shipmentId], references: [shipments.id] }),
}));

export const partnersRelations = relations(partners, ({ many }) => ({
  orders: many(orders),
  shipments: many(shipments),
}));

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

export const collectionsRelations = relations(collections, ({ many }) => ({
  collectionItems: many(collectionItems),
}));

export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, { fields: [collectionItems.collectionId], references: [collections.id] }),
  item: one(items, { fields: [collectionItems.itemId], references: [items.id] }),
}));

export const webhooksRelations = relations(webhooks, ({ many }) => ({
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhooks, { fields: [webhookDeliveries.webhookId], references: [webhooks.id] }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, { fields: [auditLog.userId], references: [users.id] }),
}));

// Row types
export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
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
