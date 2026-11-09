import "server-only";
import { and, asc, eq, inArray, like, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { categories, items, MOVEMENT_TYPES, stockMovements, type MovementType } from "@/db/tenant-schema";
import { endOfLocalDay, localTodayIso, startOfLocalDay } from "./dates";
import { sumMoney } from "./money";

/**
 * Справка „Приход и разход за период“: по артикул — начално количество, получено, изписано и крайно количество
 * (и стойностите им по себестойността на движенията). Дните са местни (Europe/Sofia), както в другите справки.
 */
export type MovementReportFilters = {
  from: string;
  to: string;
  locationId: number | null;
  categoryId: number | null;
  /** Само този вид движение в колоните „получено/изписано“; началното и крайното количество са от всички движения. */
  type: MovementType | null;
  /** in — само артикули с приход, out — само с разход. */
  direction: "in" | "out" | null;
  q: string | null;
  /** Ограничение на потребителя по локации (null = всички). */
  allowedLocations: number[] | null;
};

export type MovementReportRow = {
  itemId: number;
  sku: string;
  name: string;
  variant: string | null;
  unit: string;
  categoryId: number | null;
  category: string | null;
  categoryColor: string | null;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  closingQty: number;
  closingValue: number;
  moves: number;
};

export type MovementReportTotals = Pick<MovementReportRow, "openingValue" | "inValue" | "outValue" | "closingValue" | "moves"> & { items: number };

const isoRe = /^\d{4}-\d{2}-\d{2}$/;

/** Чете филтрите от адреса; без дати — днес. */
export function readMovementReportFilters(sp: Record<string, string | string[] | undefined>, allowedLocations: number[] | null): MovementReportFilters {
  const get = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || null;
  };
  const today = localTodayIso();
  let from = isoRe.test(get("from") ?? "") ? get("from")! : today;
  let to = isoRe.test(get("to") ?? "") ? get("to")! : from;
  if (to < from) [from, to] = [to, from];
  const type = get("type");
  const direction = get("direction");
  let locationId = Number(get("location")) || null;
  if (locationId && allowedLocations && !allowedLocations.includes(locationId)) locationId = null;
  return {
    from,
    to,
    locationId,
    categoryId: Number(get("category")) || null,
    type: type && (MOVEMENT_TYPES as readonly string[]).includes(type) ? (type as MovementType) : null,
    direction: direction === "in" || direction === "out" ? direction : null,
    q: get("q"),
    allowedLocations,
  };
}

/** Адресът на справката с тези филтри (за линкове, CSV и PDF). */
export function movementReportQuery(f: MovementReportFilters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ from: f.from, to: f.to, ...extra });
  if (f.locationId) p.set("location", String(f.locationId));
  if (f.categoryId) p.set("category", String(f.categoryId));
  if (f.type) p.set("type", f.type);
  if (f.direction) p.set("direction", f.direction);
  if (f.q) p.set("q", f.q);
  return p.toString();
}

export async function movementReport(db: Db, f: MovementReportFilters) {
  const start = startOfLocalDay(f.from);
  const end = endOfLocalDay(f.to);
  const inPeriod = sql`${stockMovements.createdAt} >= ${start}`;
  const typeOk = f.type ? sql` and ${stockMovements.type} = ${f.type}` : sql``;
  const periodIn = sql`${inPeriod}${typeOk} and ${stockMovements.delta} > 0`;
  const periodOut = sql`${inPeriod}${typeOk} and ${stockMovements.delta} < 0`;
  const num = (expr: SQL) => sql<number>`coalesce(${expr}, 0)`.mapWith(Number);

  const conds: Array<SQL | undefined> = [lt(stockMovements.createdAt, end)];
  if (f.locationId) conds.push(eq(stockMovements.locationId, f.locationId));
  else if (f.allowedLocations) conds.push(inArray(stockMovements.locationId, f.allowedLocations));
  if (f.categoryId) conds.push(eq(items.categoryId, f.categoryId));
  if (f.q) {
    const term = `%${f.q}%`;
    conds.push(or(like(items.name, term), like(items.sku, term), like(items.barcode, term)));
  }

  const raw = await db
    .select({
      itemId: items.id,
      sku: items.sku,
      name: items.name,
      variant: items.variantLabel,
      unit: items.unit,
      categoryId: items.categoryId,
      category: categories.name,
      categoryColor: categories.color,
      openingQty: num(sql`sum(case when ${stockMovements.createdAt} < ${start} then ${stockMovements.delta} end)`),
      openingValue: num(sql`sum(case when ${stockMovements.createdAt} < ${start} then ${stockMovements.value} end)`),
      inQty: num(sql`sum(case when ${periodIn} then ${stockMovements.delta} end)`),
      inValue: num(sql`sum(case when ${periodIn} then ${stockMovements.value} end)`),
      outQty: num(sql`-sum(case when ${periodOut} then ${stockMovements.delta} end)`),
      outValue: num(sql`-sum(case when ${periodOut} then ${stockMovements.value} end)`),
      closingQty: num(sql`sum(${stockMovements.delta})`),
      closingValue: num(sql`sum(${stockMovements.value})`),
      moves: num(sql`sum(case when ${inPeriod}${typeOk} then 1 end)`),
    })
    .from(stockMovements)
    .innerJoin(items, eq(items.id, stockMovements.itemId))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .where(and(...conds))
    .groupBy(items.id)
    .having(sql`sum(case when ${inPeriod}${typeOk} then 1 end) > 0`)
    .orderBy(asc(categories.name), asc(items.name), asc(items.variantLabel));

  const rows: MovementReportRow[] = raw.filter((r) => (f.direction === "in" ? r.inQty > 0 : f.direction === "out" ? r.outQty > 0 : true));

  // групи по категория с междинни суми
  const groups: Array<{ categoryId: number | null; name: string; color: string | null; rows: MovementReportRow[]; totals: MovementReportTotals }> = [];
  for (const r of rows) {
    let g = groups.find((x) => x.categoryId === r.categoryId);
    if (!g) {
      g = { categoryId: r.categoryId, name: r.category ?? "Без категория", color: r.categoryColor, rows: [], totals: emptyTotals() };
      groups.push(g);
    }
    g.rows.push(r);
  }
  for (const g of groups) g.totals = totalsOf(g.rows);
  return { rows, groups, totals: totalsOf(rows) };
}

function emptyTotals(): MovementReportTotals {
  return { items: 0, openingValue: 0, inValue: 0, outValue: 0, closingValue: 0, moves: 0 };
}

function totalsOf(rows: MovementReportRow[]): MovementReportTotals {
  return {
    items: rows.length,
    openingValue: sumMoney(rows.map((r) => r.openingValue)),
    inValue: sumMoney(rows.map((r) => r.inValue)),
    outValue: sumMoney(rows.map((r) => r.outValue)),
    closingValue: sumMoney(rows.map((r) => r.closingValue)),
    moves: rows.reduce((n, r) => n + r.moves, 0),
  };
}

/** Етикети на видовете движения за филтъра. */
export const MOVEMENT_TYPE_OPTIONS: Array<{ value: MovementType; label: string }> = [
  { value: "in", label: "Приход (доставка)" },
  { value: "out", label: "Разход (продажба, изписване)" },
  { value: "write_off", label: "Брак" },
  { value: "adjust", label: "Корекция" },
  { value: "transfer_in", label: "Трансфер — вход" },
  { value: "transfer_out", label: "Трансфер — изход" },
  { value: "produce_in", label: "Производство — готов продукт" },
  { value: "produce_out", label: "Производство — вложени материали" },
];

