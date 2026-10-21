import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { subDays } from "date-fns";
import type { Db, TenantDb } from "@/db/tenant";
import { itemSuppliers, items, orderLines, orders, partners, shipmentLines, shipments, stockMovements, type Item } from "@/db/tenant-schema";
import { lineTotal, sumMoney } from "./money";
import { nextNumber } from "./numbering";
import { addQty, itemDecimals, subQty, sumQty } from "./quantity";
import { getDefaultLocation } from "./queries";
import { getSettings } from "./settings";
import { assignVat } from "./vat-rates";

/**
 * Предложения за поръчка: средна дневна консумация (продажби за прозореца от настройките) × (срок на
 * доставка + буфер) + минимум − наличност − очаквано. Срокът е от доставчика на артикула, после от
 * партньора, после от настройките; количеството се вдига до минималното за доставчика.
 * Очаквано = входящи пратки в път + неполученото по потвърдени поръчки за доставка (без двойно броене).
 */
export type Suggestion = {
  item: Item;
  supplierId: number | null;
  supplierName: string | null;
  supplierSku: string | null;
  avgDaily: number;
  leadDays: number;
  target: number;
  incoming: number;
  quantity: number;
  unitPrice: number;
  value: number;
  daysLeft: number | null;
};

/** Закръгляне нагоре до позволените знаци на артикула (цели бройки за бр.). */
const ceilTo = (v: number, decimals: number) => Math.ceil(v * 10 ** decimals - 1e-9) / 10 ** decimals;

async function incoming(db: Db) {
  const map = new Map<number, number>();
  const add = (itemId: number, q: number) => map.set(itemId, addQty(map.get(itemId) ?? 0, q));
  const pending = await db
    .select({ itemId: shipmentLines.itemId, quantity: shipmentLines.quantity, orderId: shipments.orderId })
    .from(shipmentLines)
    .innerJoin(shipments, eq(shipments.id, shipmentLines.shipmentId))
    .where(and(eq(shipments.direction, "inbound"), eq(shipments.isReturn, false), inArray(shipments.status, ["pending", "in_transit"])));
  const inShipments = new Map<string, number>();
  for (const p of pending) {
    add(p.itemId, p.quantity);
    if (p.orderId) inShipments.set(`${p.orderId}:${p.itemId}`, addQty(inShipments.get(`${p.orderId}:${p.itemId}`) ?? 0, p.quantity));
  }
  const open = await db
    .select({ orderId: orderLines.orderId, itemId: orderLines.itemId, quantity: orderLines.quantity, fulfilled: orderLines.fulfilledQuantity })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(and(eq(orders.type, "purchase"), inArray(orders.status, ["confirmed", "partial"])));
  for (const l of open) {
    const key = `${l.orderId}:${l.itemId}`;
    const rest = Math.max(0, subQty(subQty(l.quantity, l.fulfilled), inShipments.get(key) ?? 0));
    inShipments.set(key, Math.max(0, subQty(inShipments.get(key) ?? 0, subQty(l.quantity, l.fulfilled))));
    add(l.itemId, rest);
  }
  return map;
}

export async function replenishmentSuggestions(db: Db) {
  const s = await getSettings(db);
  const since = subDays(new Date(), s.windowDays);
  const [active, flows, supplierRows, partnerRows, coming] = await Promise.all([
    db.select().from(items).where(eq(items.status, "active")),
    db
      .select({ itemId: stockMovements.itemId, out: sql<number>`coalesce(sum(-${stockMovements.delta}), 0)`.mapWith(Number) })
      .from(stockMovements)
      .where(and(eq(stockMovements.type, "out"), gte(stockMovements.createdAt, since)))
      .groupBy(stockMovements.itemId),
    db.select().from(itemSuppliers),
    db.select({ id: partners.id, name: partners.name, leadTimeDays: partners.leadTimeDays }).from(partners),
    incoming(db),
  ]);
  const outBy = new Map(flows.map((f) => [f.itemId, f.out]));
  const partnerBy = new Map(partnerRows.map((p) => [p.id, p]));

  const rows: Suggestion[] = [];
  for (const item of active) {
    const own = supplierRows.filter((x) => x.itemId === item.id);
    const sup = own.find((x) => x.preferred) ?? (own.length === 1 ? own[0] : undefined);
    const partner = sup ? partnerBy.get(sup.partnerId) : undefined;
    const leadDays = sup?.leadTimeDays ?? partner?.leadTimeDays ?? s.leadTimeDays;
    const decimals = itemDecimals(item);
    const avgDaily = (outBy.get(item.id) ?? 0) / s.windowDays;
    const target = addQty(ceilTo(avgDaily * (leadDays + s.safetyDays), decimals), item.minQuantity);
    const inc = coming.get(item.id) ?? 0;
    let need = subQty(subQty(target, item.quantity), inc);
    if (need <= 0) continue;
    if (sup?.minOrderQuantity && need < sup.minOrderQuantity) need = sup.minOrderQuantity;
    const unitPrice = sup?.purchasePrice ?? item.unitCost;
    rows.push({
      item,
      supplierId: sup?.partnerId ?? null,
      supplierName: partner?.name ?? null,
      supplierSku: sup?.supplierSku ?? null,
      avgDaily,
      leadDays,
      target,
      incoming: inc,
      quantity: ceilTo(need, decimals),
      unitPrice,
      value: lineTotal(ceilTo(need, decimals), unitPrice),
      daysLeft: avgDaily > 0 ? Math.floor(item.quantity / avgDaily) : null,
    });
  }
  // по доставчик; без доставчик — накрая
  const groups = new Map<string, { supplierId: number | null; supplierName: string | null; rows: Suggestion[] }>();
  for (const r of rows.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))) {
    const key = String(r.supplierId ?? "none");
    const g = groups.get(key) ?? { supplierId: r.supplierId, supplierName: r.supplierName, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, total: sumMoney(g.rows.map((r) => r.value)), units: sumQty(g.rows, (r) => r.quantity) }))
    .sort((a, b) => (a.supplierId === null ? 1 : b.supplierId === null ? -1 : b.total - a.total));
}

/** Чернови на поръчки за доставка — по една на доставчик — от избраните редове. */
export async function createDraftPurchaseOrders(db: TenantDb, lines: Array<{ itemId: number; supplierId: number | null; quantity: number; unitPrice: number }>, createdBy: number) {
  const bySupplier = new Map<string, typeof lines>();
  for (const l of lines.filter((x) => x.quantity > 0)) bySupplier.set(String(l.supplierId ?? "none"), [...(bySupplier.get(String(l.supplierId ?? "none")) ?? []), l]);
  const location = await getDefaultLocation(db);
  const created: Array<{ id: number; number: string; lines: number }> = [];
  for (const group of bySupplier.values()) {
    const withVat = await assignVat(db, group.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice })));
    const r = await db.transaction(async (tx) => {
      const number = await nextNumber(tx, "purchase");
      const [{ id }] = await tx
        .insert(orders)
        .values({ type: "purchase", number, partnerId: group[0].supplierId, locationId: location?.id ?? null, status: "draft", orderDate: new Date().toISOString().slice(0, 10), notes: "Създадена от предложенията за поръчка.", pricesIncludeVat: false, createdBy }) // цените при доставчика са без ДДС
        .$returningId();
      await tx.insert(orderLines).values(withVat.map((l) => ({ ...l, orderId: id })));
      return { id, number, lines: withVat.length };
    });
    created.push(r);
  }
  return created;
}
