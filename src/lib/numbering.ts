import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { documentCounters } from "@/db/tenant-schema";
import { localTodayIso } from "./dates";

/**
 * Поредни номера на документите, без дупки и без повторения. Броячът се увеличава атомарно
 * (INSERT … ON DUPLICATE KEY UPDATE с LAST_INSERT_ID) в транзакцията на документа — заключването на реда
 * държи паралелните записи в опашка, а при отмяна номерът се връща.
 *  - складови документи: ПРЕФИКС-ГГГГ-NNN, по вид и година;
 *  - фактури и известия: общ десетразряден ред само с арабски цифри (чл. 114, ал. 1, т. 2 ЗДДС), без
 *    нулиране по години; проформите не са данъчни документи — свой ред ПФ-ГГГГ-NNN.
 */
export const DOC_PREFIXES = { purchase: "ПЗ", sales: "ПР", count: "ИНВ", writeOff: "БР", proforma: "ПФ" } as const;
export type DocType = keyof typeof DOC_PREFIXES;

const INVOICE_SERIES = "invoice";
const NO_YEAR = 0;

const format = (type: DocType, year: number, n: number) => `${DOC_PREFIXES[type]}-${year}-${String(n).padStart(3, "0")}`;
const formatInvoice = (n: number) => String(n).padStart(10, "0");
const currentYear = () => Number(localTodayIso().slice(0, 4));

async function bump(tx: Db, docType: string, year: number) {
  const [res] = await tx.execute(
    sql`insert into ${documentCounters} (doc_type, year, last_number) values (${docType}, ${year}, last_insert_id(1)) on duplicate key update last_number = last_insert_id(last_number + 1)`,
  );
  return (res as unknown as { insertId: number }).insertId;
}

async function current(db: Db, docType: string, year: number) {
  const [row] = await db.select().from(documentCounters).where(and(eq(documentCounters.docType, docType), eq(documentCounters.year, year)));
  return row?.lastNumber ?? 0;
}

/** Следващият номер; извиква се в транзакцията, която създава документа. */
export async function nextNumber(tx: Db, type: DocType, year = currentYear()) {
  return format(type, year, await bump(tx, type, year));
}

/** Какъв ще е следващият номер (за подсказка във формата) — без да го заема. */
export async function peekNumber(db: Db, type: DocType, year = currentYear()) {
  return format(type, year, (await current(db, type, year)) + 1);
}

/** Номер при издаване на фактура/известие (десетразряден) или проформа. */
export async function nextInvoiceNumber(tx: Db, kind: "invoice" | "credit_note" | "debit_note" | "proforma") {
  if (kind === "proforma") return nextNumber(tx, "proforma");
  return formatInvoice(await bump(tx, INVOICE_SERIES, NO_YEAR));
}

export async function peekInvoiceNumber(db: Db) {
  return formatInvoice((await current(db, INVOICE_SERIES, NO_YEAR)) + 1);
}

/** Продължаване на номерацията от предишен софтуер: следващият номер, само ако още няма издадени. */
export async function setNextInvoiceNumber(db: Db, next: number) {
  await db
    .insert(documentCounters)
    .values({ docType: INVOICE_SERIES, year: NO_YEAR, lastNumber: next - 1 })
    .onDuplicateKeyUpdate({ set: { lastNumber: next - 1 } });
}
