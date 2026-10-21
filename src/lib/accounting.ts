import "server-only";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { invoiceLines, invoices, partners, shipments, stockMovements } from "@/db/tenant-schema";
import { endOfLocalDay, startOfLocalDay } from "./dates";
import { KIND_TITLES } from "./invoicing";
import { sumMoney } from "./money";

/**
 * Експорт за счетоводителя за период (обикновено месец):
 *  - продажби: издадените фактури и известия по дата на издаване, основа и ДДС по ставка (кредитните
 *    известия със знак минус, анулираните — с нули и бележка); проформите не са данъчни документи;
 *  - доставки: получените пратки (приход по поръчка или без) по себестойност, връщанията към доставчик
 *    с минус. Фактурите на доставчиците не се водят в системата — номерът им е в референцията на пратката.
 * Дневниците по ЗДДС (за НАП) се съставят от счетоводителя — тук са изходните данни.
 */

export const RATES = [20, 9, 0] as const;

export async function salesJournal(db: Db, from: string, to: string) {
  const docs = await db
    .select()
    .from(invoices)
    .where(and(inArray(invoices.status, ["issued", "cancelled"]), inArray(invoices.kind, ["invoice", "credit_note", "debit_note"]), gte(invoices.issueDate, from), lt(invoices.issueDate, nextDay(to))))
    .orderBy(asc(invoices.number));
  const lines = docs.length ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, docs.map((d) => d.id))) : [];
  const rows = docs.map((d) => {
    const sign = d.kind === "credit_note" ? -1 : 1;
    const active = d.status === "issued";
    const own = lines.filter((l) => l.invoiceId === d.id);
    const byRate = Object.fromEntries(
      RATES.map((r) => {
        const at = own.filter((l) => l.vatRate === r);
        return [r, { net: active ? sign * sumMoney(at.map((l) => l.netAmount)) : 0, vat: active ? sign * sumMoney(at.map((l) => l.vatAmount)) : 0 }];
      }),
    ) as Record<(typeof RATES)[number], { net: number; vat: number }>;
    return { doc: d, kind: KIND_TITLES[d.kind], byRate, gross: active ? sign * d.grossTotal : 0, note: d.status === "cancelled" ? `анулиран: ${d.reason ?? ""}` : "" };
  });
  const totals = Object.fromEntries(RATES.map((r) => [r, { net: sumMoney(rows.map((x) => x.byRate[r].net)), vat: sumMoney(rows.map((x) => x.byRate[r].vat)) }])) as Record<(typeof RATES)[number], { net: number; vat: number }>;
  return { rows, totals, gross: sumMoney(rows.map((r) => r.gross)), vat: sumMoney(RATES.map((r) => totals[r].vat)) };
}

export async function purchasesList(db: Db, from: string, to: string) {
  const moves = await db
    .select({ shipment: shipments, partnerName: partners.name, partnerEik: partners.eik, partnerVat: partners.vatNumber, value: stockMovements.value })
    .from(stockMovements)
    .innerJoin(shipments, eq(shipments.id, stockMovements.shipmentId))
    .leftJoin(partners, eq(partners.id, shipments.partnerId))
    .where(
      and(
        eq(shipments.status, "delivered"),
        gte(shipments.deliveredAt, startOfLocalDay(from)),
        lt(shipments.deliveredAt, endOfLocalDay(to)),
        // приходи от доставчици и връщания към тях; връщанията от клиенти са от страната на продажбите
        inArray(shipments.direction, ["inbound", "outbound"]),
      ),
    );
  const byShipment = new Map<number, { shipment: (typeof moves)[number]["shipment"]; partner: string; eik: string | null; vat: string | null; value: number }>();
  for (const m of moves) {
    const purchase = (m.shipment.direction === "inbound" && !m.shipment.isReturn) || (m.shipment.direction === "outbound" && m.shipment.isReturn);
    if (!purchase) continue;
    const row = byShipment.get(m.shipment.id) ?? { shipment: m.shipment, partner: m.partnerName ?? m.shipment.partner ?? "", eik: m.partnerEik, vat: m.partnerVat, value: 0 };
    row.value = sumMoney([row.value, m.value]); // приходът е +, връщането към доставчик е −
    byShipment.set(m.shipment.id, row);
  }
  const rows = [...byShipment.values()].sort((a, b) => (a.shipment.deliveredAt?.getTime() ?? 0) - (b.shipment.deliveredAt?.getTime() ?? 0));
  return { rows, total: sumMoney(rows.map((r) => r.value)) };
}

function nextDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
