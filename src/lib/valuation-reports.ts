import "server-only";
import { and, asc, eq, gte, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { categories, items, orderLines, partners, shipments, stockMovements } from "@/db/tenant-schema";
import { endOfLocalDay, startOfLocalDay } from "./dates";
import { lineTotal, sumMoney } from "./money";
import { addQty } from "./quantity";

/**
 * Справки по себестойността от движенията (stock_movements.value):
 *  - стойност на склада към дата = сумата на стойностите на движенията до края на деня;
 *  - себестойност на продажбите и марж за период — от доставените пратки (изходящи продажби минус
 *    връщанията от клиенти); приходът е по цената от поръчката, без поръчка — по продажната цена.
 * Датите са ГГГГ-ММ-ДД в местната часова зона (src/lib/dates.ts); периодът включва и двата дни.
 */

export async function stockValueAt(db: Db, date: string, o: { locationId?: number | null; categoryId?: number | null } = {}) {
  const rows = await db
    .select({
      itemId: items.id,
      sku: items.sku,
      name: items.name,
      variant: items.variantLabel,
      unit: items.unit,
      category: categories.name,
      quantity: sql<number>`sum(${stockMovements.delta})`.mapWith(Number),
      value: sql<number>`sum(${stockMovements.value})`.mapWith(Number),
    })
    .from(stockMovements)
    .innerJoin(items, eq(items.id, stockMovements.itemId))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .where(and(lt(stockMovements.createdAt, endOfLocalDay(date)), o.locationId ? eq(stockMovements.locationId, o.locationId) : undefined, o.categoryId ? eq(items.categoryId, o.categoryId) : undefined))
    .groupBy(items.id)
    .having(sql`sum(${stockMovements.delta}) <> 0 or sum(${stockMovements.value}) <> 0`)
    .orderBy(asc(items.name), asc(items.variantLabel));
  return { rows, total: sumMoney(rows.map((r) => r.value)) };
}

type MarginRow = { quantity: number; revenue: number; cost: number };
const margin = <T extends MarginRow>(r: T) => ({ ...r, margin: sumMoney([r.revenue, -r.cost]), marginPct: r.revenue > 0 ? (sumMoney([r.revenue, -r.cost]) / r.revenue) * 100 : 0 });

export async function salesMargin(db: Db, from: string, to: string) {
  const moves = await db
    .select({
      itemId: stockMovements.itemId,
      delta: stockMovements.delta,
      value: stockMovements.value,
      orderId: shipments.orderId,
      partnerId: shipments.partnerId,
      partnerName: sql<string | null>`coalesce(${partners.name}, ${shipments.partner})`,
      sku: items.sku,
      name: items.name,
      variant: items.variantLabel,
      unit: items.unit,
      itemPrice: items.unitPrice,
    })
    .from(stockMovements)
    .innerJoin(shipments, eq(shipments.id, stockMovements.shipmentId))
    .innerJoin(items, eq(items.id, stockMovements.itemId))
    .leftJoin(partners, eq(partners.id, shipments.partnerId))
    .where(
      and(
        eq(shipments.status, "delivered"),
        gte(shipments.deliveredAt, startOfLocalDay(from)),
        lt(shipments.deliveredAt, endOfLocalDay(to)),
        // продажби и връщания от клиенти; връщанията към доставчици са от страната на покупките
        or(and(eq(shipments.direction, "outbound"), eq(shipments.isReturn, false)), and(eq(shipments.direction, "inbound"), eq(shipments.isReturn, true))),
      ),
    );

  const orderIds = [...new Set(moves.map((m) => m.orderId).filter((id): id is number => id !== null))];
  const prices = new Map<string, number>();
  if (orderIds.length) {
    for (const l of await db.select().from(orderLines).where(sql`${orderLines.orderId} in (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})`)) {
      const key = `${l.orderId}:${l.itemId}`;
      if (!prices.has(key)) prices.set(key, l.unitPrice);
    }
  }

  const byItem = new Map<number, MarginRow & { sku: string; name: string; variant: string | null; unit: string }>();
  const byPartner = new Map<string, MarginRow & { name: string }>();
  const totals: MarginRow = { quantity: 0, revenue: 0, cost: 0 };
  for (const m of moves) {
    const quantity = -m.delta; // продажба +, връщане −
    const price = (m.orderId !== null ? prices.get(`${m.orderId}:${m.itemId}`) : undefined) ?? m.itemPrice;
    const revenue = lineTotal(quantity, price);
    const cost = -m.value;
    const add = (r: MarginRow) => {
      r.quantity = addQty(r.quantity, quantity);
      r.revenue = sumMoney([r.revenue, revenue]);
      r.cost = sumMoney([r.cost, cost]);
    };
    const it = byItem.get(m.itemId) ?? { sku: m.sku, name: m.name, variant: m.variant, unit: m.unit, quantity: 0, revenue: 0, cost: 0 };
    add(it);
    byItem.set(m.itemId, it);
    const partnerKey = m.partnerId !== null ? `id:${m.partnerId}` : `name:${m.partnerName ?? ""}`;
    const p = byPartner.get(partnerKey) ?? { name: m.partnerName || "Без клиент", quantity: 0, revenue: 0, cost: 0 };
    add(p);
    byPartner.set(partnerKey, p);
    add(totals);
  }
  const sort = <T extends MarginRow>(rows: T[]) => rows.map(margin).sort((a, b) => b.revenue - a.revenue);
  return { items: sort([...byItem.values()]), partners: sort([...byPartner.values()]), totals: margin(totals) };
}
