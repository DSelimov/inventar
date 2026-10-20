import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  calendarEvents,
  categories,
  collectionItems,
  collections,
  fieldDefinitions,
  items,
  shipments,
  stockMovements,
  type ItemStatus,
  type ShipmentStatus,
} from "@/db/schema";

// ----------------------------------------------------------------- categories
export async function listCategories() {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      description: categories.description,
      color: categories.color,
      itemCount: sql<number>`(select count(*) from ${items} where ${items.categoryId} = ${categories.id})`,
      fieldCount: sql<number>`(select count(*) from ${fieldDefinitions} where ${fieldDefinitions.categoryId} = ${categories.id})`,
    })
    .from(categories)
    .orderBy(asc(categories.name));
  return rows;
}

export async function getCategory(id: number) {
  return db.query.categories.findFirst({
    where: eq(categories.id, id),
    with: { fields: { orderBy: [asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.id)] } },
  });
}

export async function listCategoriesWithFields() {
  return db.query.categories.findMany({
    orderBy: [asc(categories.name)],
    with: { fields: { orderBy: [asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.id)] } },
  });
}

// ---------------------------------------------------------------------- items
export type ItemFilters = {
  q?: string;
  categoryId?: number;
  status?: ItemStatus | "all";
  low?: boolean;
};

export async function listItems(filters: ItemFilters = {}) {
  const where = [];
  if (filters.q) {
    const term = `%${filters.q}%`;
    where.push(or(like(items.name, term), like(items.sku, term), like(items.location, term)));
  }
  if (filters.categoryId) where.push(eq(items.categoryId, filters.categoryId));
  if (filters.status && filters.status !== "all") where.push(eq(items.status, filters.status));
  else if (!filters.status) where.push(eq(items.status, "active"));
  if (filters.low) where.push(and(sql`${items.minQuantity} > 0`, lte(items.quantity, items.minQuantity)));

  return db.query.items.findMany({
    where: where.length ? and(...where) : undefined,
    with: { category: true },
    orderBy: [asc(items.name)],
  });
}

export async function listItemOptions() {
  return db
    .select({ id: items.id, name: items.name, sku: items.sku, unit: items.unit, quantity: items.quantity })
    .from(items)
    .where(eq(items.status, "active"))
    .orderBy(asc(items.name));
}

export async function getItem(id: number) {
  return db.query.items.findFirst({
    where: eq(items.id, id),
    with: {
      category: { with: { fields: { orderBy: [asc(fieldDefinitions.sortOrder)] } } },
      fieldValues: true,
      movements: { orderBy: [desc(stockMovements.createdAt), desc(stockMovements.id)], limit: 50, with: { shipment: true } },
      collectionItems: { with: { collection: true } },
    },
  });
}

// ------------------------------------------------------------------ shipments
export async function listShipments(status?: ShipmentStatus | "all") {
  return db.query.shipments.findMany({
    where: status && status !== "all" ? eq(shipments.status, status) : undefined,
    with: { lines: true },
    orderBy: [desc(shipments.createdAt), desc(shipments.id)],
  });
}

export async function getShipment(id: number) {
  return db.query.shipments.findFirst({
    where: eq(shipments.id, id),
    with: { lines: { with: { item: true } } },
  });
}

// ---------------------------------------------------------------- collections
export async function listCollections() {
  return db
    .select({
      id: collections.id,
      name: collections.name,
      description: collections.description,
      color: collections.color,
      itemCount: sql<number>`(select count(*) from ${collectionItems} where ${collectionItems.collectionId} = ${collections.id})`,
      totalQuantity: sql<number>`coalesce((select sum(${items.quantity}) from ${collectionItems} join ${items} on ${items.id} = ${collectionItems.itemId} where ${collectionItems.collectionId} = ${collections.id}), 0)`,
    })
    .from(collections)
    .orderBy(asc(collections.name));
}

export async function getCollection(id: number) {
  return db.query.collections.findFirst({
    where: eq(collections.id, id),
    with: { collectionItems: { with: { item: { with: { category: true } } } } },
  });
}

// ------------------------------------------------------------------- calendar
export type CalendarEntry = {
  key: string;
  date: string;
  title: string;
  kind: "event" | "reminder" | "deadline" | "inbound" | "outbound";
  href?: string;
  id?: number;
};

export async function listCalendarEntries(fromIso: string, toIso: string): Promise<CalendarEntry[]> {
  const [events, ships] = await Promise.all([
    db
      .select()
      .from(calendarEvents)
      .where(and(gte(calendarEvents.date, fromIso), lte(calendarEvents.date, toIso)))
      .orderBy(asc(calendarEvents.date)),
    db
      .select()
      .from(shipments)
      .where(
        and(
          gte(shipments.expectedDate, fromIso),
          lte(shipments.expectedDate, toIso),
          sql`${shipments.status} in ('pending', 'in_transit')`,
        ),
      ),
  ]);

  const entries: CalendarEntry[] = [
    ...events.map((e) => ({
      key: `e-${e.id}`,
      id: e.id,
      date: e.date,
      title: e.title,
      kind: e.type,
    })),
    ...ships.map((s) => ({
      key: `s-${s.id}`,
      date: s.expectedDate!,
      title: `${s.reference}${s.partner ? ` · ${s.partner}` : ""}`,
      kind: s.direction,
      href: `/shipments/${s.id}`,
    })),
  ];
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ------------------------------------------------------------------ dashboard
export async function getDashboard(todayIso: string, weekAheadIso: string) {
  const [totals] = await db
    .select({
      itemCount: sql<number>`count(*)`,
      totalUnits: sql<number>`coalesce(sum(${items.quantity}), 0)`,
      stockValue: sql<number>`coalesce(sum(${items.quantity} * ${items.unitCost}), 0)`,
      retailValue: sql<number>`coalesce(sum(${items.quantity} * ${items.unitPrice}), 0)`,
      lowStock: sql<number>`coalesce(sum(case when ${items.minQuantity} > 0 and ${items.quantity} <= ${items.minQuantity} then 1 else 0 end), 0)`,
    })
    .from(items)
    .where(eq(items.status, "active"));

  const [shipmentTotals] = await db
    .select({
      open: sql<number>`coalesce(sum(case when ${shipments.status} in ('pending','in_transit') then 1 else 0 end), 0)`,
      overdue: sql<number>`coalesce(sum(case when ${shipments.status} in ('pending','in_transit') and ${shipments.expectedDate} < ${todayIso} then 1 else 0 end), 0)`,
    })
    .from(shipments);

  const lowStockItems = await db.query.items.findMany({
    where: and(eq(items.status, "active"), sql`${items.minQuantity} > 0`, lte(items.quantity, items.minQuantity)),
    with: { category: true },
    orderBy: [asc(items.quantity)],
    limit: 6,
  });

  const recentMovements = await db.query.stockMovements.findMany({
    orderBy: [desc(stockMovements.createdAt), desc(stockMovements.id)],
    limit: 8,
    with: { item: true },
  });

  const upcoming = await listCalendarEntries(todayIso, weekAheadIso);

  const byCategory = await db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      units: sql<number>`coalesce(sum(${items.quantity}), 0)`,
      value: sql<number>`coalesce(sum(${items.quantity} * ${items.unitCost}), 0)`,
    })
    .from(categories)
    .leftJoin(items, and(eq(items.categoryId, categories.id), eq(items.status, "active")))
    .groupBy(categories.id)
    .orderBy(desc(sql`coalesce(sum(${items.quantity} * ${items.unitCost}), 0)`));

  return { totals, shipmentTotals, lowStockItems, recentMovements, upcoming, byCategory };
}
