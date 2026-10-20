import "server-only";
import { and, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { addDays, format, startOfMonth, subDays, subMonths } from "date-fns";
import type { Db } from "@/db/tenant";
import { categories, items, lots, partners, stockMovements, type Item } from "@/db/tenant-schema";
import { incomingQuantities } from "./queries";
import type { AppSettings } from "./settings";

const n = (expr: ReturnType<typeof sql<number>>) => expr.mapWith(Number);

export type Reports = Awaited<ReturnType<typeof buildReports>>;

export async function buildReports(db: Db, s: AppSettings) {
  const now = new Date();
  const windowStart = subDays(now, s.windowDays);
  const deadStart = subDays(now, s.deadStockDays);

  const activeItems = await db.query.items.findMany({ where: eq(items.status, "active"), with: { category: true } });

  // ---- outbound / inbound per item within the window
  const flows = await db
    .select({
      itemId: stockMovements.itemId,
      out: n(sql<number>`coalesce(sum(case when ${stockMovements.type} = 'out' then -${stockMovements.delta} else 0 end), 0)`),
      inn: n(sql<number>`coalesce(sum(case when ${stockMovements.type} = 'in' then ${stockMovements.delta} else 0 end), 0)`),
    })
    .from(stockMovements)
    .where(gte(stockMovements.createdAt, windowStart))
    .groupBy(stockMovements.itemId);
  const flowByItem = new Map(flows.map((f) => [f.itemId, f]));

  // ---- last outbound and last inbound per item (for dead stock / ageing)
  const lastMoves = await db
    .select({
      itemId: stockMovements.itemId,
      lastOut: sql<Date | null>`max(case when ${stockMovements.type} = 'out' then ${stockMovements.createdAt} end)`,
      lastIn: sql<Date | null>`max(case when ${stockMovements.type} in ('in','transfer_in') or (${stockMovements.type} = 'adjust' and ${stockMovements.delta} > 0) then ${stockMovements.createdAt} end)`,
    })
    .from(stockMovements)
    .groupBy(stockMovements.itemId);
  const lastByItem = new Map(lastMoves.map((m) => [m.itemId, { lastOut: m.lastOut ? new Date(m.lastOut) : null, lastIn: m.lastIn ? new Date(m.lastIn) : null }]));

  // ---- turnover by category
  const catMap = new Map<number | null, { id: number | null; name: string; color: string; units: number; revenue: number; cost: number }>();
  for (const it of activeItems) {
    const out = flowByItem.get(it.id)?.out ?? 0;
    const key = it.categoryId;
    const entry = catMap.get(key) ?? { id: key, name: it.category?.name ?? "Без категория", color: it.category?.color ?? "#9ca3af", units: 0, revenue: 0, cost: 0 };
    entry.units += out;
    entry.revenue += out * it.unitPrice;
    entry.cost += out * it.unitCost;
    catMap.set(key, entry);
  }
  const turnover = [...catMap.values()]
    .map((c) => ({ ...c, margin: c.revenue - c.cost, marginPct: c.revenue > 0 ? ((c.revenue - c.cost) / c.revenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const totals = turnover.reduce((acc, c) => ({ units: acc.units + c.units, revenue: acc.revenue + c.revenue, cost: acc.cost + c.cost }), { units: 0, revenue: 0, cost: 0 });

  // ---- top movers
  const topMovers = activeItems
    .map((it) => ({ item: it, out: flowByItem.get(it.id)?.out ?? 0 }))
    .filter((x) => x.out > 0)
    .sort((a, b) => b.out - a.out)
    .slice(0, 10);

  // ---- dead stock
  const deadStock = activeItems
    .filter((it) => it.quantity > 0)
    .filter((it) => {
      const last = lastByItem.get(it.id)?.lastOut;
      return !last || last < deadStart;
    })
    .map((it) => ({ item: it, lastOut: lastByItem.get(it.id)?.lastOut ?? null, value: it.quantity * it.unitCost }))
    .sort((a, b) => b.value - a.value);

  // ---- ageing buckets (days since last inbound)
  const BUCKETS = [
    { label: "0–30 дни", max: 30 },
    { label: "31–60 дни", max: 60 },
    { label: "61–90 дни", max: 90 },
    { label: "91–180 дни", max: 180 },
    { label: "над 180 дни", max: Infinity },
  ];
  const ageing = BUCKETS.map((b) => ({ ...b, items: 0, units: 0, value: 0 }));
  for (const it of activeItems) {
    if (it.quantity <= 0) continue;
    const lastIn = lastByItem.get(it.id)?.lastIn ?? it.createdAt;
    const days = Math.floor((now.getTime() - lastIn.getTime()) / 86_400_000);
    const bucket = ageing.find((b) => days <= b.max)!;
    bucket.items++;
    bucket.units += it.quantity;
    bucket.value += it.quantity * it.unitCost;
  }

  // ---- reorder suggestions
  const incoming = await incomingQuantities(db);
  const supplierLead = await db.select({ lead: partners.leadTimeDays }).from(partners).where(inArray(partners.type, ["supplier", "both"]));
  const avgLead = supplierLead.filter((x) => x.lead).length ? Math.round(supplierLead.reduce((a, x) => a + (x.lead ?? 0), 0) / supplierLead.filter((x) => x.lead).length) : s.leadTimeDays;
  const coverDays = avgLead + s.safetyDays;
  const reorder = activeItems
    .map((it) => {
      const out = flowByItem.get(it.id)?.out ?? 0;
      const avgDaily = out / s.windowDays;
      const target = Math.ceil(avgDaily * coverDays) + it.minQuantity;
      const incomingQty = incoming.get(it.id) ?? 0;
      const suggest = Math.max(0, target - it.quantity - incomingQty);
      const daysLeft = avgDaily > 0 ? Math.floor(it.quantity / avgDaily) : null;
      return { item: it, avgDaily, target, incoming: incomingQty, suggest, daysLeft };
    })
    .filter((r) => r.suggest > 0)
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  // ---- monthly stock value, last 12 months (reconstructed backwards from today)
  const monthStart = startOfMonth(subMonths(now, 11));
  const monthly = await db
    .select({
      month: sql<string>`date_format(${stockMovements.createdAt}, '%Y-%m')`,
      deltaValue: n(sql<number>`coalesce(sum(${stockMovements.delta} * ${items.unitCost}), 0)`),
    })
    .from(stockMovements)
    .innerJoin(items, eq(items.id, stockMovements.itemId))
    .where(gte(stockMovements.createdAt, monthStart))
    .groupBy(sql`date_format(${stockMovements.createdAt}, '%Y-%m')`);
  const deltaByMonth = new Map(monthly.map((m) => [m.month, m.deltaValue]));
  const currentValue = activeItems.reduce((a, it) => a + it.quantity * it.unitCost, 0);
  const series: Array<{ month: string; label: string; value: number }> = [];
  let running = currentValue;
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i);
    const key = format(d, "yyyy-MM");
    series.unshift({ month: key, label: format(d, "MMM", { locale: undefined }), value: Math.max(0, running) });
    running -= deltaByMonth.get(key) ?? 0; // value at the end of the previous month
  }

  // ---- expiring lots
  const expiring = await db.query.lots.findMany({
    where: and(gt(lots.quantity, 0), lte(lots.expiryDate, format(addDays(now, 90), "yyyy-MM-dd"))),
    with: { item: true, location: true },
    orderBy: (l, { asc }) => [asc(l.expiryDate)],
    limit: 50,
  });

  const [{ catCount }] = await db.select({ catCount: n(sql<number>`count(*)`) }).from(categories);

  return { settings: s, windowStart, totals, turnover, topMovers, deadStock, ageing, reorder, series, currentValue, expiring, coverDays, avgLead, catCount, itemCount: activeItems.length };
}

export type ReorderRow = Reports["reorder"][number];
export type DeadRow = Reports["deadStock"][number];
export type ItemWithCategory = Item & { category: { name: string; color: string } | null };
