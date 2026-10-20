import { and, asc, desc, eq, gt, gte, inArray, like, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { offsetOf, PAGE_SIZE, type Page } from "./paging";
import {
  apiKeys,
  calendarEvents,
  categories,
  collectionItems,
  collections,
  fieldDefinitions,
  items,
  locations,
  lots,
  orders,
  partners,
  shipmentLines,
  shipments,
  stockLevels,
  stockMovements,
  webhooks,
  type ItemStatus,
  type MovementType,
  type OrderStatus,
  type OrderType,
  type PartnerType,
  type ShipmentDirection,
  type ShipmentStatus,
} from "@/db/tenant-schema";

const n = (expr: ReturnType<typeof sql<number>>) => expr.mapWith(Number);
const countExpr = () => n(sql<number>`count(*)`);
type Where = ReturnType<typeof and>;

// ------------------------------------------------------------------ locations
export async function listLocations(db: Db, includeInactive = false) {
  return db
    .select()
    .from(locations)
    .where(includeInactive ? undefined : eq(locations.active, true))
    .orderBy(desc(locations.isDefault), asc(locations.name));
}

export async function getDefaultLocation(db: Db) {
  const list = await listLocations(db);
  return list.find((l) => l.isDefault) ?? list[0] ?? null;
}

// ----------------------------------------------------------------- categories
export async function listCategories(db: Db) {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      description: categories.description,
      color: categories.color,
      itemCount: n(sql<number>`(select count(*) from ${items} where ${items.categoryId} = ${categories.id})`),
      fieldCount: n(sql<number>`(select count(*) from ${fieldDefinitions} where ${fieldDefinitions.categoryId} = ${categories.id})`),
    })
    .from(categories)
    .orderBy(asc(categories.name));
}

export async function getCategory(db: Db, id: number) {
  return db.query.categories.findFirst({
    where: eq(categories.id, id),
    with: { fields: { orderBy: [asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.id)] } },
  });
}

export async function listCategoriesWithFields(db: Db) {
  return db.query.categories.findMany({
    orderBy: [asc(categories.name)],
    with: { fields: { orderBy: [asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.id)] } },
  });
}

// ---------------------------------------------------------------------- items
export type ItemFilters = { q?: string; categoryId?: number; status?: ItemStatus | "all"; low?: boolean; locationId?: number };

/**
 * Подзаявките се строят с db.select(): в релационните заявки (findMany) всяка колона в sql`` се
 * преименува към alias-а на основната таблица и подзаявка към друга таблица би се счупила.
 */
function itemWhere(db: Db, filters: ItemFilters): Where {
  const where = [];
  if (filters.q) {
    const term = `%${filters.q}%`;
    where.push(or(like(items.name, term), like(items.sku, term), like(items.barcode, term), like(items.variantLabel, term))!);
  }
  if (filters.categoryId) where.push(eq(items.categoryId, filters.categoryId));
  if (filters.status && filters.status !== "all") where.push(eq(items.status, filters.status));
  else if (!filters.status) where.push(eq(items.status, "active"));
  if (filters.low) where.push(and(gt(items.minQuantity, 0), lte(items.quantity, items.minQuantity))!);
  if (filters.locationId) {
    where.push(inArray(items.id, db.select({ id: stockLevels.itemId }).from(stockLevels).where(and(eq(stockLevels.locationId, filters.locationId), gt(stockLevels.quantity, 0)))));
  }
  return where.length ? and(...where) : undefined;
}

const itemListWith = { category: true, parent: true, stockLevels: { with: { location: true } } } as const;

export async function listItems(db: Db, filters: ItemFilters = {}) {
  return db.query.items.findMany({ where: itemWhere(db, filters), with: itemListWith, orderBy: [asc(items.name), asc(items.variantLabel)] });
}

export async function pageItems(db: Db, filters: ItemFilters, page: number) {
  const where = itemWhere(db, filters);
  const [rows, [{ total }]] = await Promise.all([
    db.query.items.findMany({ where, with: itemListWith, orderBy: [asc(items.name), asc(items.variantLabel), asc(items.id)], limit: PAGE_SIZE, offset: offsetOf(page) }),
    db.select({ total: countExpr() }).from(items).where(where),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function listItemOptions(db: Db) {
  return db
    .select({
      id: items.id,
      name: items.name,
      sku: items.sku,
      unit: items.unit,
      quantity: items.quantity,
      tracking: items.tracking,
      variantLabel: items.variantLabel,
      unitCost: items.unitCost,
      unitPrice: items.unitPrice,
    })
    .from(items)
    .where(eq(items.status, "active"))
    .orderBy(asc(items.name), asc(items.variantLabel));
}

export async function getItem(db: Db, id: number) {
  return db.query.items.findFirst({
    where: eq(items.id, id),
    with: {
      category: { with: { fields: { orderBy: [asc(fieldDefinitions.sortOrder)] } } },
      fieldValues: true,
      parent: true,
      variants: { orderBy: [asc(items.variantLabel)] },
      stockLevels: { with: { location: true } },
      lots: { where: gt(lots.quantity, 0), with: { location: true }, orderBy: [asc(lots.expiryDate), asc(lots.id)] },
      movements: { orderBy: [desc(stockMovements.createdAt), desc(stockMovements.id)], limit: 50, with: { shipment: true, location: true, lot: true } },
      collectionItems: { with: { collection: true } },
    },
  });
}

export async function findItemByCode(db: Db, code: string) {
  return db.query.items.findFirst({
    where: or(eq(items.barcode, code), eq(items.sku, code)),
    with: { category: true, stockLevels: { with: { location: true } } },
  });
}

export async function listAvailableLots(db: Db) {
  return db.query.lots.findMany({ where: gt(lots.quantity, 0), with: { location: true }, orderBy: [asc(lots.expiryDate), asc(lots.id)] });
}

// -------------------------------------------------------------------- partners
const partnerColumns = {
  id: partners.id,
  name: partners.name,
  type: partners.type,
  email: partners.email,
  phone: partners.phone,
  leadTimeDays: partners.leadTimeDays,
  orderCount: n(sql<number>`(select count(*) from ${orders} where ${orders.partnerId} = ${partners.id})`),
};
const partnerTypeWhere = (type?: PartnerType | "all") => (type && type !== "all" ? or(eq(partners.type, type), eq(partners.type, "both")) : undefined);

export async function listPartners(db: Db, type?: PartnerType | "all") {
  return db.select(partnerColumns).from(partners).where(partnerTypeWhere(type)).orderBy(asc(partners.name));
}

export async function pagePartners(db: Db, filters: { type?: PartnerType | "all"; q?: string }, page: number) {
  const term = filters.q ? `%${filters.q}%` : null;
  const where = and(partnerTypeWhere(filters.type), term ? or(like(partners.name, term), like(partners.email, term), like(partners.phone, term), like(partners.vatNumber, term)) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db.select(partnerColumns).from(partners).where(where).orderBy(asc(partners.name), asc(partners.id)).limit(PAGE_SIZE).offset(offsetOf(page)),
    db.select({ total: countExpr() }).from(partners).where(where),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function getPartner(db: Db, id: number) {
  return db.query.partners.findFirst({
    where: eq(partners.id, id),
    with: {
      orders: { orderBy: [desc(orders.createdAt)], limit: 20, with: { lines: true } },
      shipments: { orderBy: [desc(shipments.createdAt)], limit: 20 },
    },
  });
}

// ---------------------------------------------------------------------- orders
export type OrderFilters = { type?: OrderType | "all"; status?: OrderStatus | "all"; q?: string };

function orderWhere(db: Db, filters: OrderFilters): Where {
  const where = [];
  if (filters.type && filters.type !== "all") where.push(eq(orders.type, filters.type));
  if (filters.status && filters.status !== "all") where.push(eq(orders.status, filters.status));
  if (filters.q) {
    const term = `%${filters.q}%`;
    where.push(or(like(orders.number, term), inArray(orders.partnerId, db.select({ id: partners.id }).from(partners).where(like(partners.name, term))))!);
  }
  return where.length ? and(...where) : undefined;
}

export async function listOrders(db: Db, filters: OrderFilters = {}) {
  return db.query.orders.findMany({
    where: orderWhere(db, filters),
    with: { partner: true, location: true, lines: true },
    orderBy: [desc(orders.createdAt), desc(orders.id)],
  });
}

export async function pageOrders(db: Db, filters: OrderFilters, page: number) {
  const where = orderWhere(db, filters);
  const [rows, [{ total }]] = await Promise.all([
    db.query.orders.findMany({ where, with: { partner: true, location: true, lines: true }, orderBy: [desc(orders.createdAt), desc(orders.id)], limit: PAGE_SIZE, offset: offsetOf(page) }),
    db.select({ total: countExpr() }).from(orders).where(where),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function getOrder(db: Db, id: number) {
  return db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: { partner: true, location: true, lines: { with: { item: true } }, shipments: { orderBy: [desc(shipments.createdAt)], with: { lines: true } } },
  });
}

export async function nextOrderNumber(db: Db, type: OrderType) {
  const [row] = await db.select({ count: n(sql<number>`count(*)`) }).from(orders).where(eq(orders.type, type));
  const prefix = type === "purchase" ? "ПЗ" : "ПР";
  return `${prefix}-${new Date().getFullYear()}-${String((row?.count ?? 0) + 1).padStart(3, "0")}`;
}

/** Очаквано количество от отворени входящи пратки, по артикул. */
export async function incomingQuantities(db: Db): Promise<Map<number, number>> {
  const rows = await db
    .select({ itemId: shipmentLines.itemId, qty: n(sql<number>`sum(${shipmentLines.quantity})`) })
    .from(shipmentLines)
    .innerJoin(shipments, eq(shipments.id, shipmentLines.shipmentId))
    .where(and(eq(shipments.direction, "inbound"), inArray(shipments.status, ["pending", "in_transit"])))
    .groupBy(shipmentLines.itemId);
  return new Map(rows.map((r) => [r.itemId, r.qty]));
}

// ------------------------------------------------------------------ shipments
export async function listShipments(db: Db, status?: ShipmentStatus | "all") {
  return db.query.shipments.findMany({
    where: status && status !== "all" ? eq(shipments.status, status) : undefined,
    with: { lines: true, location: true, partnerRecord: true, order: true },
    orderBy: [desc(shipments.createdAt), desc(shipments.id)],
  });
}

export type ShipmentFilters = { status?: ShipmentStatus | "all"; direction?: ShipmentDirection | "all"; q?: string };

export async function pageShipments(db: Db, filters: ShipmentFilters, page: number) {
  const conds = [];
  if (filters.status && filters.status !== "all") conds.push(eq(shipments.status, filters.status));
  if (filters.direction && filters.direction !== "all") conds.push(eq(shipments.direction, filters.direction));
  if (filters.q) {
    const term = `%${filters.q}%`;
    conds.push(or(like(shipments.reference, term), like(shipments.partner, term), like(shipments.trackingNumber, term), like(shipments.carrier, term))!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.query.shipments.findMany({ where, with: { lines: true, location: true, partnerRecord: true, order: true }, orderBy: [desc(shipments.createdAt), desc(shipments.id)], limit: PAGE_SIZE, offset: offsetOf(page) }),
    db.select({ total: countExpr() }).from(shipments).where(where),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function getShipment(db: Db, id: number) {
  return db.query.shipments.findFirst({
    where: eq(shipments.id, id),
    with: { lines: { with: { item: true, lot: true } }, location: true, order: true, partnerRecord: true },
  });
}

// ------------------------------------------------------------------ movements
export type MovementFilters = { itemId?: number; q?: string; locationId?: number; type?: MovementType; from?: string; to?: string; userId?: number };

export async function pageMovements(db: Db, filters: MovementFilters, page: number) {
  const conds = [];
  if (filters.itemId) conds.push(eq(stockMovements.itemId, filters.itemId));
  if (filters.q) {
    const term = `%${filters.q}%`;
    const matching = db.select({ id: items.id }).from(items).where(or(like(items.name, term), like(items.sku, term), like(items.barcode, term)));
    conds.push(or(like(stockMovements.reason, term), inArray(stockMovements.itemId, matching))!);
  }
  if (filters.locationId) conds.push(eq(stockMovements.locationId, filters.locationId));
  if (filters.type) conds.push(eq(stockMovements.type, filters.type));
  // датите са дни по UTC (createdAt се пази в UTC)
  if (filters.from) conds.push(gte(stockMovements.createdAt, new Date(`${filters.from}T00:00:00Z`)));
  if (filters.to) conds.push(lt(stockMovements.createdAt, new Date(new Date(`${filters.to}T00:00:00Z`).getTime() + 86_400_000)));
  if (filters.userId) conds.push(eq(stockMovements.userId, filters.userId));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.query.stockMovements.findMany({ where, with: { item: true, location: true, lot: true, shipment: true }, orderBy: [desc(stockMovements.createdAt), desc(stockMovements.id)], limit: PAGE_SIZE, offset: offsetOf(page) }),
    db.select({ total: countExpr() }).from(stockMovements).where(where),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE } satisfies Page<(typeof rows)[number]>;
}

/** Потребителите, правили движения (за филтъра; имената са запазени към момента на движението). */
export async function listMovementUsers(db: Db) {
  return db
    .selectDistinct({ id: stockMovements.userId, name: stockMovements.userName })
    .from(stockMovements)
    .where(sql`${stockMovements.userId} is not null`)
    .orderBy(asc(stockMovements.userName));
}

// ---------------------------------------------------------------- collections
export async function listCollections(db: Db) {
  return db
    .select({
      id: collections.id,
      name: collections.name,
      description: collections.description,
      color: collections.color,
      itemCount: n(sql<number>`(select count(*) from ${collectionItems} where ${collectionItems.collectionId} = ${collections.id})`),
      totalQuantity: n(
        sql<number>`coalesce((select sum(${items.quantity}) from ${collectionItems} join ${items} on ${items.id} = ${collectionItems.itemId} where ${collectionItems.collectionId} = ${collections.id}), 0)`,
      ),
    })
    .from(collections)
    .orderBy(asc(collections.name));
}

export async function getCollection(db: Db, id: number) {
  return db.query.collections.findFirst({ where: eq(collections.id, id), with: { collectionItems: { with: { item: { with: { category: true } } } } } });
}

// ------------------------------------------------------------------- calendar
export type CalendarEntry = {
  key: string;
  date: string;
  title: string;
  kind: "event" | "reminder" | "deadline" | "inbound" | "outbound" | "expiry";
  href?: string;
  id?: number;
};

export async function listCalendarEntries(db: Db, fromIso: string, toIso: string): Promise<CalendarEntry[]> {
  const [events, ships, expiring] = await Promise.all([
    db.select().from(calendarEvents).where(and(gte(calendarEvents.date, fromIso), lte(calendarEvents.date, toIso))).orderBy(asc(calendarEvents.date)),
    db
      .select()
      .from(shipments)
      .where(and(gte(shipments.expectedDate, fromIso), lte(shipments.expectedDate, toIso), inArray(shipments.status, ["pending", "in_transit"]))),
    db.query.lots.findMany({ where: and(gt(lots.quantity, 0), gte(lots.expiryDate, fromIso), lte(lots.expiryDate, toIso)), with: { item: true } }),
  ]);
  const entries: CalendarEntry[] = [
    ...events.map((e) => ({ key: `e-${e.id}`, id: e.id, date: e.date, title: e.title, kind: e.type })),
    ...ships.map((s) => ({ key: `s-${s.id}`, date: s.expectedDate!, title: `${s.reference}${s.partner ? ` · ${s.partner}` : ""}`, kind: s.direction, href: `/shipments/${s.id}` })),
    ...expiring.map((l) => ({ key: `l-${l.id}`, date: l.expiryDate!, title: `Изтича: ${l.item.name} (${l.lotNumber})`, kind: "expiry" as const, href: `/items/${l.itemId}` })),
  ];
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ------------------------------------------------------------------ dashboard
export async function getDashboard(db: Db, todayIso: string, weekAheadIso: string) {
  const [totals] = await db
    .select({
      itemCount: n(sql<number>`count(*)`),
      totalUnits: n(sql<number>`coalesce(sum(${items.quantity}), 0)`),
      stockValue: n(sql<number>`coalesce(sum(${items.quantity} * ${items.unitCost}), 0)`),
      retailValue: n(sql<number>`coalesce(sum(${items.quantity} * ${items.unitPrice}), 0)`),
      lowStock: n(sql<number>`coalesce(sum(case when ${items.minQuantity} > 0 and ${items.quantity} <= ${items.minQuantity} then 1 else 0 end), 0)`),
    })
    .from(items)
    .where(eq(items.status, "active"));

  const [shipmentTotals] = await db
    .select({
      open: n(sql<number>`coalesce(sum(case when ${shipments.status} in ('pending','in_transit') then 1 else 0 end), 0)`),
      overdue: n(sql<number>`coalesce(sum(case when ${shipments.status} in ('pending','in_transit') and ${shipments.expectedDate} < ${todayIso} then 1 else 0 end), 0)`),
    })
    .from(shipments);

  const [orderTotals] = await db
    .select({ open: n(sql<number>`coalesce(sum(case when ${orders.status} in ('confirmed','partial') then 1 else 0 end), 0)`) })
    .from(orders);

  const lowStockItems = await db.query.items.findMany({
    where: and(eq(items.status, "active"), gt(items.minQuantity, 0), lte(items.quantity, items.minQuantity)),
    with: { category: true },
    orderBy: [asc(items.quantity)],
    limit: 6,
  });

  const recentMovements = await db.query.stockMovements.findMany({
    orderBy: [desc(stockMovements.createdAt), desc(stockMovements.id)],
    limit: 8,
    with: { item: true, location: true },
  });

  const upcoming = await listCalendarEntries(db, todayIso, weekAheadIso);

  const byCategory = await db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      units: n(sql<number>`coalesce(sum(${items.quantity}), 0)`),
      value: n(sql<number>`coalesce(sum(${items.quantity} * ${items.unitCost}), 0)`),
    })
    .from(categories)
    .leftJoin(items, and(eq(items.categoryId, categories.id), eq(items.status, "active")))
    .groupBy(categories.id)
    .orderBy(desc(sql`coalesce(sum(${items.quantity} * ${items.unitCost}), 0)`));

  const byLocation = await db
    .select({
      id: locations.id,
      name: locations.name,
      units: n(sql<number>`coalesce(sum(${stockLevels.quantity}), 0)`),
      value: n(sql<number>`coalesce(sum(${stockLevels.quantity} * ${items.unitCost}), 0)`),
    })
    .from(locations)
    .leftJoin(stockLevels, eq(stockLevels.locationId, locations.id))
    .leftJoin(items, eq(items.id, stockLevels.itemId))
    .where(eq(locations.active, true))
    .groupBy(locations.id)
    .orderBy(asc(locations.name));

  const expiringSoon = await db.query.lots.findMany({
    where: and(gt(lots.quantity, 0), lte(lots.expiryDate, weekAheadIso)),
    with: { item: true, location: true },
    orderBy: [asc(lots.expiryDate)],
    limit: 5,
  });

  return { totals, shipmentTotals, orderTotals, lowStockItems, recentMovements, upcoming, byCategory, byLocation, expiringSoon };
}

// ------------------------------------------------------------- administration
export async function listApiKeys(db: Db) {
  return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
}

export async function listWebhooks(db: Db) {
  return db.query.webhooks.findMany({
    with: { deliveries: { orderBy: (d, { desc }) => [desc(d.createdAt)], limit: 5 } },
    orderBy: [desc(webhooks.createdAt)],
  });
}
