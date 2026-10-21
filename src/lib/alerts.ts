import "server-only";
import { addDays, format } from "date-fns";
import { and, asc, count, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { items, lots, shipments } from "@/db/tenant-schema";
import { getSettings } from "./settings";

/**
 * Известия: ниска наличност, закъснели пратки, партиди с изтичащ (≤ 30 дни) или изтекъл срок.
 * Изчисляват се в момента — камбанката, страницата /notifications и дневният имейл използват едно и също.
 */
export const EXPIRY_WARNING_DAYS = 30;

function ranges(todayIso: string) {
  return { today: todayIso, soon: format(addDays(new Date(`${todayIso}T00:00:00`), EXPIRY_WARNING_DAYS), "yyyy-MM-dd") };
}

const lowStockWhere = and(eq(items.status, "active"), gt(items.minQuantity, 0), lte(items.quantity, items.minQuantity));
const overdueWhere = (today: string) => and(inArray(shipments.status, ["pending", "in_transit"]), lt(shipments.expectedDate, today));

/** Само броя (за камбанката при всяка страница). */
export async function alertCounts(db: Db, todayIso: string) {
  const { today, soon } = ranges(todayIso);
  const s = await getSettings(db);
  const [[low], [overdue], [expiring], [expired]] = await Promise.all([
    s.lowStockAlerts ? db.select({ n: count() }).from(items).where(lowStockWhere) : Promise.resolve([{ n: 0 }]),
    db.select({ n: count() }).from(shipments).where(overdueWhere(today)),
    db.select({ n: count() }).from(lots).where(and(gt(lots.quantity, 0), gte(lots.expiryDate, today), lte(lots.expiryDate, soon))),
    db.select({ n: count() }).from(lots).where(and(gt(lots.quantity, 0), lt(lots.expiryDate, today))),
  ]);
  const counts = { lowStock: low.n, overdue: overdue.n, expiring: expiring.n, expired: expired.n };
  return { ...counts, total: counts.lowStock + counts.overdue + counts.expiring + counts.expired };
}

/** Пълните списъци (страницата с известия и имейлът). */
export async function listAlerts(db: Db, todayIso: string, limit = 100) {
  const { today, soon } = ranges(todayIso);
  const s = await getSettings(db);
  const [lowStock, overdue, expiring, expired] = await Promise.all([
    s.lowStockAlerts ? db.query.items.findMany({ where: lowStockWhere, orderBy: [asc(items.quantity), asc(items.name)], limit }) : Promise.resolve([]),
    db.query.shipments.findMany({ where: overdueWhere(today), with: { lines: true, partnerRecord: true }, orderBy: [asc(shipments.expectedDate)], limit }),
    db.query.lots.findMany({ where: and(gt(lots.quantity, 0), gte(lots.expiryDate, today), lte(lots.expiryDate, soon)), with: { item: true, location: true }, orderBy: [asc(lots.expiryDate)], limit }),
    db.query.lots.findMany({ where: and(gt(lots.quantity, 0), lt(lots.expiryDate, today)), with: { item: true, location: true }, orderBy: [asc(lots.expiryDate)], limit }),
  ]);
  return { lowStock, overdue, expiring, expired, total: lowStock.length + overdue.length + expiring.length + expired.length };
}

export type Alerts = Awaited<ReturnType<typeof listAlerts>>;
