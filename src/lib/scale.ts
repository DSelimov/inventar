import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { items, settings, type Item } from "@/db/tenant-schema";
import { divideToQuantity, itemDecimals } from "./quantity";
import { parseScaleBarcode, pluCandidates, readScaleFormats, type ScaleReading } from "./scale-barcode";

export const SCALE_FORMATS_KEY = "scale.formats";

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
  return { item, reading, quantity: scaleQuantity(item, reading) };
}
