import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { documentCounters } from "@/db/tenant-schema";
import { localTodayIso } from "./dates";

/**
 * Поредни номера на документите: ПРЕФИКС-ГГГГ-NNN, по вид и година, без дупки и без повторения.
 * Броячът се увеличава атомарно (INSERT … ON DUPLICATE KEY UPDATE с LAST_INSERT_ID) в транзакцията на
 * документа — заключването на реда държи паралелните записи в опашка, а при отмяна номерът се връща.
 */
export const DOC_PREFIXES = { purchase: "ПЗ", sales: "ПР", count: "ИНВ", writeOff: "БР" } as const;
export type DocType = keyof typeof DOC_PREFIXES;

const format = (type: DocType, year: number, n: number) => `${DOC_PREFIXES[type]}-${year}-${String(n).padStart(3, "0")}`;
const currentYear = () => Number(localTodayIso().slice(0, 4));

/** Следващият номер; извиква се в транзакцията, която създава документа. */
export async function nextNumber(tx: Db, type: DocType, year = currentYear()) {
  const [res] = await tx.execute(
    sql`insert into ${documentCounters} (doc_type, year, last_number) values (${type}, ${year}, last_insert_id(1)) on duplicate key update last_number = last_insert_id(last_number + 1)`,
  );
  return format(type, year, (res as unknown as { insertId: number }).insertId);
}

/** Какъв ще е следващият номер (за подсказка във формата) — без да го заема. */
export async function peekNumber(db: Db, type: DocType, year = currentYear()) {
  const [row] = await db.select().from(documentCounters).where(and(eq(documentCounters.docType, type), eq(documentCounters.year, year)));
  return format(type, year, (row?.lastNumber ?? 0) + 1);
}
