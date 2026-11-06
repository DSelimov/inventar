import "server-only";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { itemUnits, items } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { str } from "./forms";
import { nextSequence } from "./numbering";
import { getInternalPrefix } from "./scale";
import { eanCheckDigit } from "./scale-barcode";

/**
 * Тип баркод (обикновен / теглови / количествен) → PLU и знаци: теглови — дробно количество, количествен —
 * цели бройки, обикновен — без PLU. Празен PLU при теглови/количествен = следващият свободен.
 */
export async function applyBarcodeType(db: Db, fd: FormData, data: { plu: string | null; quantityDecimals: number; tracking: string; barcode: string | null }, exceptId?: number) {
  const type = (["standard", "weight", "count"] as const).find((t) => t === str(fd, "barcodeType")) ?? (data.plu ? null : "standard");
  if (type === null) return; // формуляр без избор (API/импорт): PLU остава както е подаден
  if (type === "standard") {
    data.plu = null;
    if (!data.barcode && fd.get("generateBarcode") === "1") data.barcode = await generateInternalBarcode(db);
    return;
  }
  if (data.tracking === "serial") throw new UserError("Артикул със серийни номера не може да е теглови или количествен.");
  if (type === "weight" && data.quantityDecimals === 0) throw new UserError("Тегловият артикул е с дробно количество — изберете „3 знака“ при Количества.");
  if (type === "count") data.quantityDecimals = 0;
  if (!data.plu) {
    const [row] = await db.select({ max: sql<number>`coalesce(max(cast(${items.plu} as unsigned)), 0)` }).from(items).where(and(isNotNull(items.plu), exceptId ? ne(items.id, exceptId) : undefined));
    data.plu = String(Number(row.max) + 1);
  }
}

/** Вътрешен EAN-13: префикс (по подразбиране 20) + пореден номер + контролна цифра; уникален. */
export async function generateInternalBarcode(db: Db) {
  const prefix = await getInternalPrefix(db);
  for (let attempt = 0; attempt < 20; attempt++) {
    const n = await nextSequence(db, "ean.internal");
    const first12 = (prefix + String(n).padStart(12 - prefix.length, "0")).slice(0, 12);
    const code = first12 + eanCheckDigit(first12);
    const [taken] = await db.select({ id: items.id }).from(items).where(eq(items.barcode, code));
    const [takenUnit] = await db.select({ id: itemUnits.id }).from(itemUnits).where(eq(itemUnits.barcode, code));
    if (!taken && !takenUnit) return code;
  }
  throw new UserError("Не успях да генерирам свободен баркод.");
}

