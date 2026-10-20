import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
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
  memberships,
  orders,
  partners,
  shipments,
  stockLevels,
  stockMovements,
  webhooks,
  type ItemStatus,
  type OrderStatus,
  type OrderType,
  type PartnerType,
  type ShipmentStatus,
} from "@/db/schema";

const n = (expr: ReturnType<typeof sql<number>>) => expr.mapWith(Number);

// ------------------------------------------------------------------ locations
export async function listLocations(orgId: number, includeInactive = false) {
  return db
    .select()
    .from(locations)
    .where(includeInactive ? eq(locations.organizationId, orgId) : and(eq(locations.organizationId, orgId), eq(locations.active, true)))
    .orderBy(desc(locations.isDefault), asc(locations.name));
}

export async function getDefaultLocation(orgId: number) {
  const list = await listLocations(orgId);
  return list.find((l) => l.isDefault) ?? list[0] ?? null;
}

// ----------------------------------------------------------------- categories
export async function listCategories(orgId: number) {
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
    .where(eq(categories.organizationId, orgId))
    .orderBy(asc(categories.name));
}

export async function getCategory(orgId: number, id: number) {
  return db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.organizationId, orgId)),
    with: { fields: { orderBy: [asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.id)] } },
  });
}

export async function listCategoriesWithFields(orgId: number) {
  return db.query.categories.findMany({
    where: eq(categories.organizationId, orgId),
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
  locationId?: number;
};

export async function listItems(orgId: number, filters: ItemFilters = {}) {
  const where = [eq(items.organizationId, orgId)];
  if (filters.q) {
    const term = `%${filters.q}%`;
    where.push(or(ilike(items.name, term), ilike(items.sku, term), ilike(items.barcode, term), ilike(items.variantLabel, term))!);
  }
  if (filters.categoryId) where.push(eq(items.categoryId, filters.categoryId));
  if (filters.status && filters.status !== "all") where.push(eq(items.status, filters.status));
  else if (!filters.status) where.push(eq(items.status, "active"));
  if (filters.low) where.push(and(gt(items.minQuantity, 0), lte(items.quantity, items.minQuantity))!);
  if (filters.locationId) {
    where.push(
      sql`exists (select 1 from ${stockLevels} where ${stockLevels.itemId} = ${items.id} and ${stockLevels.locationId} = ${filters.locationId} and ${stockLevels.quantity} > 0)`,
    );
  }
  return db.query.items.findMany({
    where: and(...where),
    with: { category: true, parent: true, stockLevels: { with: { location: true } } },
    orderBy: [asc(items.name), asc(items.variantLabel)],
  });
}

export async function listItemOptions(orgId: number) {
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
    .where(and(eq(items.organizationId, orgId), eq(items.status, "active")))
    .orderBy(asc(items.name), asc(items.variantLabel));
}

export async function getItem(orgId: number, id: number) {
  return db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.organizationId, orgId)),
    with: {
      category: { with: { fields: { orderBy: [asc(fieldDefinitions.sortOrder)] } } },
      fieldValues: true,
      parent: true,
      variants: { orderBy: [asc(items.variantLabel)] },
      stockLevels: { with: { location: true } },
      lots: { where: gt(lots.quantity, 0), with: { location: true }, orderBy: [asc(lots.expiryDate), asc(lots.id)] },
      movements: {
        orderBy: [desc(stockMovements.createdAt), desc(stockMovements.id)],
        limit: 50,
        with: { shipment: true, location: true, lot: true, user: true },
      },
      collectionItems: { with: { collection: true } },
    },
  });
}

export async function findItemByCode(orgId: number, code: string) {
  return db.query.items.findFirst({
    where: and(eq(items.organizationId, orgId), or(eq(items.barcode, code), eq(items.sku, code))),
    with: { category: true, stockLevels: { with: { location: true } } },
  });
}

export async function listAvailableLots(orgId: number) {
  return db.query.lots.findMany({
    where: and(eq(lots.organizationId, orgId), gt(lots.quantity, 0)),
    with: { location: true },
    orderBy: [asc(lots.expiryDate), asc(lots.id)],
  });
}

// -------------------------------------------------------------------- partners
export async function listPartners(orgId: number, type?: PartnerType | "all") {
  const where = [eq(partners.organizationId, orgId)];
  if (type && type !== "all") where.push(or(eq(partners.type, type), eq(partners.type, "both"))!);
  return db
    .select({
      id: partners.id,
      name: partners.name,
      type: partners.type,
      email: partners.email,
      phone: partners.phone,
      leadTimeDays: partners.leadTimeDays,
      orderCount: n(sql<number>`(select count(*) from ${orders} where ${orders.partnerId} = ${partners.id})`),
    })
    .from(partners)
    .where(and(...where))
    .orderBy(asc(partners.name));
}

export async function getPartner(orgId: number, id: number) {
  return db.query.partners.findFirst({
    where: and(eq(partners.id, id), eq(partners.organizationId, orgId)),
    with: {
      orders: { orderBy: [desc(orders.createdAt)], limit: 20, with: { lines: true } },
      shipments: { orderBy: [desc(shipments.createdAt)], limit: 20 },
    },
  });
}

// ---------------------------------------------------------------------- orders
export async function listOrders(orgId: number, filters: { type?: OrderType | "all"; status?: OrderStatus | "all" } = {}) {
  const where = [eq(orders.organizationId, orgId)];
  if (filters.type && filters.type !== "all") where.push(eq(orders.type, filters.type));
  if (filters.status && filters.status !== "all") where.push(eq(orders.status, filters.status));
  return db.query.orders.findMany({
    where: and(...where),
    with: { partner: true, location: true, lines: true },
    orderBy: [desc(orders.createdAt), desc(orders.id)],
  });
}

export async function getOrder(orgId: number, id: number) {
  return db.query.orders.findFirst({
    where: and(eq(orders.id, id), eq(orders.organizationId, orgId)),
    with: {
      partner: true,
      location: true,
      lines: { with: { item: true } },
      shipments: { orderBy: [desc(shipments.createdAt)], with: { lines: true } },
    },
  });
}

export async function nextOrderNumber(orgId: number, type: OrderType) {
  const [row] = await db
    .select({ count: n(sql<number>`count(*)`) })
    .from(orders)
    .where(and(eq(orders.organizationId, orgId), eq(orders.type, type)));
  const prefix = type === "purchase" ? "ПЗ" : "ПР";
  return `${prefix}-${new Date().getFullYear()}-${String((row?.count ?? 0) + 1).padStart(3, "0")}`;
}

/** Quantity still expected from open inbound shipments, per item. */
export async function incomingQuantities(orgId: number): Promise<Map<number, number>> {
  const rows = await db.execute<{ item_id: number; qty: string }>(sql`
    select sl.item_id, sum(sl.quantity) as qty
    from shipment_lines sl join shipments s on s.id = sl.shipment_id
    where s.organization_id = ${orgId} and s.direction = 'inbound' and s.status in ('pending','in_transit')
    group by sl.item_id`);
  return new Map(rows.rows.map((r) => [Number(r.item_id), Number(r.qty)]));
}

// ------------------------------------------------------------------ shipments
export async function listShipments(orgId: number, status?: ShipmentStatus | "all") {
  const where = [eq(shipments.organizationId, orgId)];
  if (status && status !== "all") where.push(eq(shipments.status, status));
  return db.query.shipments.findMany({
    where: and(...where),
    with: { lines: true, location: true, partnerRecord: true, order: true },
    orderBy: [desc(shipments.createdAt), desc(shipments.id)],
  });
}

export async function getShipment(orgId: number, id: number) {
  return db.query.shipments.findFirst({
    where: and(eq(shipments.id, id), eq(shipments.organizationId, orgId)),
    with: { lines: { with: { item: true, lot: true } }, location: true, order: true, partnerRecord: true },
  });
}

// ---------------------------------------------------------------- collections
export async function listCollections(orgId: number) {
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
    .where(eq(collections.organizationId, orgId))
    .orderBy(asc(collections.name));
}

export async function getCollection(orgId: number, id: number) {
  return db.query.collections.findFirst({
    where: and(eq(collections.id, id), eq(collections.organizationId, orgId)),
    with: { collectionItems: { with: { item: { with: { category: true } } } } },
  });
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

export async function listCalendarEntries(orgId: number, fromIso: string, toIso: string): Promise<CalendarEntry[]> {
  const [events, ships, expiring] = await Promise.all([
    db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.organizationId, orgId), gte(calendarEvents.date, fromIso), lte(calendarEvents.date, toIso)))
      .orderBy(asc(calendarEvents.date)),
    db
      .select()
      .from(shipments)
      .where(
        and(
          eq(shipments.organizationId, orgId),
          gte(shipments.expectedDate, fromIso),
          lte(shipments.expectedDate, toIso),
          inArray(shipments.status, ["pending", "in_transit"]),
        ),
      ),
    db.query.lots.findMany({
      where: and(eq(lots.organizationId, orgId), gt(lots.quantity, 0), gte(lots.expiryDate, fromIso), lte(lots.expiryDate, toIso)),
      with: { item: true },
    }),
  ]);

  const entries: CalendarEntry[] = [
    ...events.map((e) => ({ key: `e-${e.id}`, id: e.id, date: e.date, title: e.title, kind: e.type })),
    ...ships.map((s) => ({
      key: `s-${s.id}`,
      date: s.expectedDate!,
      title: `${s.reference}${s.partner ? ` · ${s.partner}` : ""}`,
      kind: s.direction,
      href: `/shipments/${s.id}`,
    })),
    ...expiring.map((l) => ({
      key: `l-${l.id}`,
      date: l.expiryDate!,
      title: `Изтича: ${l.item.name} (${l.lotNumber})`,
      kind: "expiry" as const,
      href: `/items/${l.itemId}`,
    })),
  ];
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ------------------------------------------------------------------ dashboard
export async function getDashboard(orgId: number, todayIso: string, weekAheadIso: string) {
  const [totals] = await db
    .select({
      itemCount: n(sql<number>`count(*)`),
      totalUnits: n(sql<number>`coalesce(sum(${items.quantity}), 0)`),
      stockValue: n(sql<number>`coalesce(sum(${items.quantity} * ${items.unitCost}), 0)`),
      retailValue: n(sql<number>`coalesce(sum(${items.quantity} * ${items.unitPrice}), 0)`),
      lowStock: n(sql<number>`coalesce(sum(case when ${items.minQuantity} > 0 and ${items.quantity} <= ${items.minQuantity} then 1 else 0 end), 0)`),
    })
    .from(items)
    .where(and(eq(items.organizationId, orgId), eq(items.status, "active")));

  const [shipmentTotals] = await db
    .select({
      open: n(sql<number>`coalesce(sum(case when ${shipments.status} in ('pending','in_transit') then 1 else 0 end), 0)`),
      overdue: n(sql<number>`coalesce(sum(case when ${shipments.status} in ('pending','in_transit') and ${shipments.expectedDate} < ${todayIso}::date then 1 else 0 end), 0)`),
    })
    .from(shipments)
    .where(eq(shipments.organizationId, orgId));

  const [orderTotals] = await db
    .select({
      open: n(sql<number>`coalesce(sum(case when ${orders.status} in ('confirmed','partial') then 1 else 0 end), 0)`),
    })
    .from(orders)
    .where(eq(orders.organizationId, orgId));

  const lowStockItems = await db.query.items.findMany({
    where: and(eq(items.organizationId, orgId), eq(items.status, "active"), gt(items.minQuantity, 0), lte(items.quantity, items.minQuantity)),
    with: { category: true },
    orderBy: [asc(items.quantity)],
    limit: 6,
  });

  const recentMovements = await db.query.stockMovements.findMany({
    where: eq(stockMovements.organizationId, orgId),
    orderBy: [desc(stockMovements.createdAt), desc(stockMovements.id)],
    limit: 8,
    with: { item: true, location: true, user: true },
  });

  const upcoming = await listCalendarEntries(orgId, todayIso, weekAheadIso);

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
    .where(eq(categories.organizationId, orgId))
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
    .where(and(eq(locations.organizationId, orgId), eq(locations.active, true)))
    .groupBy(locations.id)
    .orderBy(asc(locations.name));

  const expiringSoon = await db.query.lots.findMany({
    where: and(eq(lots.organizationId, orgId), gt(lots.quantity, 0), lte(lots.expiryDate, weekAheadIso)),
    with: { item: true, location: true },
    orderBy: [asc(lots.expiryDate)],
    limit: 5,
  });

  return { totals, shipmentTotals, orderTotals, lowStockItems, recentMovements, upcoming, byCategory, byLocation, expiringSoon };
}

// ------------------------------------------------------------- administration
export async function listMembers(orgId: number) {
  return db.query.memberships.findMany({
    where: eq(memberships.organizationId, orgId),
    with: { user: true },
    orderBy: [asc(memberships.createdAt)],
  });
}

export async function listApiKeys(orgId: number) {
  return db.select().from(apiKeys).where(eq(apiKeys.organizationId, orgId)).orderBy(desc(apiKeys.createdAt));
}

export async function listWebhooks(orgId: number) {
  return db.query.webhooks.findMany({
    where: eq(webhooks.organizationId, orgId),
    with: { deliveries: { orderBy: (d, { desc }) => [desc(d.createdAt)], limit: 5 } },
    orderBy: [desc(webhooks.createdAt)],
  });
}

export { isNull };
