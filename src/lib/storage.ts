import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Файлово хранилище на локален диск (STORAGE_DIR, по подразбиране ./storage).
 * Ключовете започват с името на клиентската база, така файловете на клиентите не се смесват.
 * Всички операции минават оттук, за да може по-късно да се добави S3-съвместим вариант.
 */
// turbopackIgnore: пътищата са по време на изпълнение, не бива да се проследяват при build.
export const STORAGE_ROOT = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "storage"));

function resolve(key: string) {
  if (!/^[A-Za-z0-9_\-./]+$/.test(key) || key.split("/").some((p) => p === "" || p === "." || p === "..")) throw new Error(`Невалиден ключ: ${key}`);
  return path.join(/* turbopackIgnore: true */ STORAGE_ROOT, key);
}

export async function putFile(key: string, data: Buffer) {
  const file = resolve(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

/** Съдържанието на файла или null, ако го няма. */
export async function getFile(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolve(key));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Изтрива файл или цяла папка (префикс). Липсващ файл не е грешка. */
export async function deleteFiles(keyOrPrefix: string) {
  await rm(resolve(keyOrPrefix), { recursive: true, force: true });
}
