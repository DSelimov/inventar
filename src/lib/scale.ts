import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { items, settings, type Item } from "@/db/tenant-schema";
import { divideToQuantity, itemDecimals } from "./quantity";
import { BARCODE_TYPE_LABELS, barcodeTypeOf, labelFits, parseScaleBarcode, pluCandidates, readScaleFormats, type ScaleReading } from "./scale-barcode";

export const SCALE_FORMATS_KEY = "scale.formats";
export const INTERNAL_PREFIX_KEY = "barcode.internalPrefix";

/** Префикс на генерираните вътрешни EAN-13 (по подразбиране 20). */
export async function getInternalPrefix(db: Db) {
  const [row] = await db.select().from(settings).where(eq(settings.key, INTERNAL_PREFIX_KEY));
  return row?.value || "20";
}

export async function getScaleFormats(db: Db) {
  const [row] = await db.select().from(settings).where(eq(settings.key, SCALE_FORMATS_KEY));
  return readScaleFormats(row?.value);
}

/** Количеството от етикета: тегло/брой направо; цена ÷ продажната цена на артикула. */
export function scaleQuantity(item: Pick<Item, "unitPrice" | "quantityDecimals" | "tracking">, reading: ScaleReading) {
  const decimals = itemDecimals(item);
  if (reading.kind === "price") return item.unitPrice > 0 ? divideToQuantity(reading.value, item.unitPrice, decimals) : null;
  return divideToQuantity(reading.value, 1, decimals);
}

/** Артикул и количество по баркод от везна; null — не е такъв баркод или няма артикул с този PLU. */
export async function scaleLookup(db: Db, code: string) {
  const formats = await getScaleFormats(db);
  if (formats.length === 0) return null;
  const reading = parseScaleBarcode(code, formats);
  if (!reading) return null;
  const [item] = await db.select().from(items).where(inArray(items.plu, pluCandidates(reading.plu)));
  if (!item) return null;
  // теглови етикет на артикул в бройки (или обратно) би изписал 1250 бр. вместо 1,25 кг
  const type = barcodeTypeOf(item);
  if (!labelFits(type, reading.kind)) {
    const what = reading.kind === "weight" ? "с тегло" : reading.kind === "count" ? "с брой" : "с цена";
    return { item, reading, quantity: null, error: `Етикетът е ${what}, а „${item.name}“ е ${BARCODE_TYPE_LABELS[type].toLowerCase()}.` };
  }
  const quantity = scaleQuantity(item, reading);
  return { item, reading, quantity, error: quantity === null ? `„${item.name}“ няма продажна цена — етикетът с цена не може да се преобразува в количество.` : null };
}
