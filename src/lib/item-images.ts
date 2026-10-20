import "server-only";
import { randomUUID } from "node:crypto";
import { asc, eq, inArray, max, min } from "drizzle-orm";
import sharp from "sharp";
import type { Organization } from "@/db/control-schema";
import type { Db } from "@/db/tenant";
import { itemImages, items, type ItemImage } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { deleteFiles, getFile, putFile } from "./storage";

/** Снимки на артикули: общо за интерфейса и REST API. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES_PER_ITEM = 12;
export const IMAGE_SIZES = ["full", "thumb"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

const ACCEPTED = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff"]);

export class ImageError extends UserError {}

/** URL за интерфейса (сесия). За API: /api/v1/items/{id}/images/{imageId}. */
export const imageUrl = (img: Pick<ItemImage, "id">, size: ImageSize = "full") => `/files/item-images/${img.id}/${size}`;

const itemPrefix = (org: Organization, itemId: number) => `${org.dbName}/items/${itemId}`;

/**
 * Обработва качените файлове: завърта по EXIF, премахва метаданните (вкл. GPS) и записва
 * WebP до 1600px + квадратна миниатюра 400px. Оригиналът не се пази.
 */
async function processImage(data: Buffer) {
  const input = sharp(data, { limitInputPixels: 60_000_000 });
  let meta;
  try {
    meta = await input.metadata();
  } catch {
    throw new ImageError("Файлът не е изображение.");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw new ImageError(`Форматът „${meta.format ?? "?"}“ не се поддържа. Използвайте JPG, PNG, WebP, GIF или AVIF.`);
  const full = await input.clone().rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await input.clone().rotate().resize({ width: 400, height: 400, fit: "cover" }).webp({ quality: 78 }).toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}

export async function listItemImages(db: Db, itemId: number) {
  return db.select().from(itemImages).where(eq(itemImages.itemId, itemId)).orderBy(asc(itemImages.sortOrder), asc(itemImages.id));
}

/** Главните снимки (най-малък sortOrder) за списък артикули. */
export async function primaryImages(db: Db, itemIds: number[]) {
  const result = new Map<number, ItemImage>();
  if (!itemIds.length) return result;
  const rows = await db.select().from(itemImages).where(inArray(itemImages.itemId, itemIds)).orderBy(asc(itemImages.sortOrder), asc(itemImages.id));
  for (const r of rows) if (!result.has(r.itemId)) result.set(r.itemId, r);
  return result;
}

/** Добавя снимки към артикул. Валидира всички файлове, преди да запише който и да е. */
export async function addItemImages(db: Db, org: Organization, itemId: number, files: File[]) {
  files = files.filter((f) => f.size > 0);
  if (!files.length) throw new ImageError("Изберете поне една снимка.");
  const [item] = await db.select({ id: items.id }).from(items).where(eq(items.id, itemId)).limit(1);
  if (!item) throw new ImageError("Артикулът не е намерен.");
  const existing = await listItemImages(db, itemId);
  if (existing.length + files.length > MAX_IMAGES_PER_ITEM) throw new ImageError(`Един артикул може да има до ${MAX_IMAGES_PER_ITEM} снимки (има ${existing.length}).`);
  for (const f of files) if (f.size > MAX_IMAGE_BYTES) throw new ImageError(`„${f.name}“ е по-голям от ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);

  const processed = [];
  for (const f of files) {
    try {
      processed.push(await processImage(Buffer.from(await f.arrayBuffer())));
    } catch (e) {
      throw new ImageError(`„${f.name}“: ${e instanceof ImageError ? e.message : "файлът не може да бъде обработен."}`);
    }
  }

  const [{ top }] = await db.select({ top: max(itemImages.sortOrder) }).from(itemImages).where(eq(itemImages.itemId, itemId));
  let order = (top ?? -1) + 1;
  const ids: number[] = [];
  for (const p of processed) {
    const key = `${itemPrefix(org, itemId)}/${randomUUID()}`;
    await putFile(`${key}-full.webp`, p.full);
    await putFile(`${key}-thumb.webp`, p.thumb);
    try {
      const [row] = await db
        .insert(itemImages)
        .values({ itemId, storageKey: key, width: p.width, height: p.height, sizeBytes: p.full.length + p.thumb.length, sortOrder: order++ })
        .$returningId();
      ids.push(row.id);
    } catch (e) {
      await Promise.all([deleteFiles(`${key}-full.webp`), deleteFiles(`${key}-thumb.webp`)]);
      throw e;
    }
  }
  return ids;
}

export async function getItemImage(db: Db, imageId: number) {
  const [img] = await db.select().from(itemImages).where(eq(itemImages.id, imageId)).limit(1);
  return img ?? null;
}

export async function readItemImage(img: ItemImage, size: ImageSize) {
  return getFile(`${img.storageKey}-${size}.webp`);
}

export async function deleteItemImage(db: Db, img: ItemImage) {
  await db.delete(itemImages).where(eq(itemImages.id, img.id));
  await Promise.all(IMAGE_SIZES.map((s) => deleteFiles(`${img.storageKey}-${s}.webp`)));
}

/** Прави снимката главна (премества я най-отпред). */
export async function makePrimaryImage(db: Db, img: ItemImage) {
  const [{ low }] = await db.select({ low: min(itemImages.sortOrder) }).from(itemImages).where(eq(itemImages.itemId, img.itemId));
  if (low !== null && low < img.sortOrder) await db.update(itemImages).set({ sortOrder: low - 1 }).where(eq(itemImages.id, img.id));
}

/** Изтрива файловете на артикул (след изтриването му; редовете се трият каскадно). */
export async function deleteItemFiles(org: Organization, itemId: number) {
  await deleteFiles(itemPrefix(org, itemId));
}

/** Снимка във формата на REST API (URL-ите изискват API ключ). */
export function apiImage(img: ItemImage) {
  const url = `/api/v1/items/${img.itemId}/images/${img.id}`;
  return { id: img.id, itemId: img.itemId, width: img.width, height: img.height, sortOrder: img.sortOrder, createdAt: img.createdAt, url, thumbnailUrl: `${url}?size=thumb` };
}
