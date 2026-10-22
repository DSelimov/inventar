import "server-only";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { invoiceLines, invoices } from "@/db/tenant-schema";
import { purchasesList } from "./accounting";
import { toCsv } from "./csv";
import { encodeCp1251 } from "./encoding";
import { KIND_TITLES } from "./invoicing";
import { roundMoney, sumMoney } from "./money";

/**
 * Файл за внос в счетоводна програма (Microinvest Делта Pro, Ажур, Плюс-Минус и др.). Програмите внасят
 * текстови/CSV файлове през импортен филтър, в който колоните се съпоставят веднъж; затова форматът е
 * един — ред на документ и ставка ДДС — с избор на кодировка, разделител, десетичен знак и дата.
 * Колоните са стабилни: нови се добавят само накрая, за да не се развалят съпоставките.
 */
export type ExportFormat = { encoding: "utf8" | "cp1251"; separator: ";" | "," | "\t"; decimal: "," | "."; date: "dd.MM.yyyy" | "yyyy-MM-dd" };
export const DEFAULT_FORMAT: ExportFormat = { encoding: "cp1251", separator: ";", decimal: ",", date: "dd.MM.yyyy" };

export function readFormat(sp: URLSearchParams): ExportFormat {
  const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T) => (allowed.includes(v as T) ? (v as T) : fallback);
  return {
    encoding: pick(sp.get("enc"), ["utf8", "cp1251"], DEFAULT_FORMAT.encoding),
    separator: pick(sp.get("sep") === "tab" ? "\t" : sp.get("sep"), [";", ",", "\t"], DEFAULT_FORMAT.separator),
    decimal: pick(sp.get("dec"), [",", "."], DEFAULT_FORMAT.decimal),
    date: pick(sp.get("date"), ["dd.MM.yyyy", "yyyy-MM-dd"], DEFAULT_FORMAT.date),
  };
}

/** Кодове на видовете документи по ЗДДС (дневник за продажбите). */
const DOC_CODES = { invoice: "01", debit_note: "02", credit_note: "03" } as const;

export const SALES_COLUMNS = [
  "Код на документа", "Вид на документа", "Номер", "Дата", "Дата на ДС", "Контрагент", "ЕИК", "ДДС №", "Държава",
  "Ставка ДДС", "Данъчна основа", "ДДС", "Общо", "Валута", "Начин на плащане", "Падеж", "Статус", "Основание (0 %)", "Към документ",
];
export const PURCHASE_COLUMNS = ["Вид", "Номер", "Дата", "Контрагент", "ЕИК", "ДДС №", "Стойност без ДДС"];

export async function salesExportRows(db: Db, from: string, to: string, f: ExportFormat) {
  const docs = await db
    .select()
    .from(invoices)
    .where(and(inArray(invoices.status, ["issued", "cancelled"]), inArray(invoices.kind, ["invoice", "credit_note", "debit_note"]), gte(invoices.issueDate, from), lt(invoices.issueDate, nextDay(to))))
    .orderBy(asc(invoices.number));
  const lines = docs.length ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, docs.map((d) => d.id))) : [];
  const related = new Map(docs.map((d) => [d.id, d.number]));
  const n = num(f);
  const rows: string[][] = [];
  for (const d of docs) {
    const sign = d.kind === "credit_note" ? -1 : 1;
    const active = d.status === "issued";
    const own = lines.filter((l) => l.invoiceId === d.id);
    const rates = [...new Set(own.map((l) => l.vatRate))].sort((a, b) => b - a);
    for (const rate of rates.length ? rates : [0]) {
      const at = own.filter((l) => l.vatRate === rate);
      const net = active ? sign * sumMoney(at.map((l) => l.netAmount)) : 0;
      const vat = active ? sign * sumMoney(at.map((l) => l.vatAmount)) : 0;
      rows.push([
        DOC_CODES[d.kind as keyof typeof DOC_CODES],
        KIND_TITLES[d.kind],
        d.number ?? "",
        d.issueDate ? date(d.issueDate, f) : "",
        date(d.taxEventDate ?? d.issueDate ?? "", f),
        d.recipientName ?? "",
        d.recipientEik ?? "",
        d.recipientVatNumber ?? "",
        d.recipientCountry ?? "BG",
        n(rate),
        n(net),
        n(vat),
        n(sumMoney([net, vat])),
        d.currency,
        d.paymentMethod ?? "",
        d.dueDate ? date(d.dueDate, f) : "",
        active ? "издаден" : "анулиран",
        rate === 0 ? (at.find((l) => l.legalBasis)?.legalBasis ?? "") : "",
        d.relatedInvoiceId ? (related.get(d.relatedInvoiceId) ?? (await relatedNumber(db, d.relatedInvoiceId))) : "",
      ]);
    }
  }
  return rows;
}

export async function purchaseExportRows(db: Db, from: string, to: string, f: ExportFormat) {
  const p = await purchasesList(db, from, to);
  const n = num(f);
  return p.rows.map((r) => [
    r.shipment.isReturn ? "Връщане към доставчик" : "Доставка",
    r.shipment.reference,
    r.shipment.deliveredAt ? date(r.shipment.deliveredAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" }), f) : "",
    r.partner,
    r.eik ?? "",
    r.vat ?? "",
    n(r.value),
  ]);
}

/** CSV в избраната кодировка; UTF-8 с BOM (за Excel), Windows-1251 без BOM. */
export function encodeCsv(rows: string[][], f: ExportFormat) {
  const text = toCsv(rows, f.separator);
  return f.encoding === "utf8" ? new TextEncoder().encode(text) : encodeCp1251(text.replace(/^﻿/, ""));
}

const num = (f: ExportFormat) => (v: number) => {
  const s = roundMoney(v).toFixed(2);
  return f.decimal === "," ? s.replace(".", ",") : s;
};
const date = (iso: string, f: ExportFormat) => (!iso ? "" : f.date === "yyyy-MM-dd" ? iso : `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`);

async function relatedNumber(db: Db, id: number) {
  const [r] = await db.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, id));
  return r?.number ?? "";
}

function nextDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
