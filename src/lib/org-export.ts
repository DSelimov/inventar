import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { is, sql } from "drizzle-orm";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import { zipSync, strToU8 } from "fflate";
import type { Organization } from "@/db/control-schema";
import type { TenantDb } from "@/db/tenant";
import * as schema from "@/db/tenant-schema";
import { toCsv } from "./csv";
import { STORAGE_ROOT } from "./storage";

/** Колони, които не се изнасят: тайни, по които може да се влезе или подпише. */
const SECRET_COLUMNS = new Set(["key_hash", "secret"]);

/**
 * Пълен експорт на организация (преносимост по чл. 20 GDPR): по един CSV файл на таблица от базата
 * на клиента (точка и запетая, UTF-8 с BOM), снимките на артикулите и README. Без тайните (хешове на
 * API ключове, тайни на webhooks).
 */
export async function organizationExport(org: Organization, db: TenantDb) {
  const files: Record<string, Uint8Array> = {};
  const tables = (Object.values(schema) as unknown[]).filter((t): t is MySqlTable => is(t, MySqlTable));
  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    const cols = columns.map((c) => c.name).filter((c) => !SECRET_COLUMNS.has(c));
    const [rows] = (await db.execute(sql.raw(`select ${cols.map((c) => `\`${c}\``).join(", ")} from \`${name}\``))) as unknown as [Array<Record<string, unknown>>];
    const cell = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v));
    files[`data/${name}.csv`] = strToU8(toCsv([cols, ...rows.map((r) => cols.map((c) => cell(r[c])))]));
  }
  for (const file of await listFiles(path.join(STORAGE_ROOT, org.dbName))) {
    files[`files/${path.relative(path.join(STORAGE_ROOT, org.dbName), file).split(path.sep).join("/")}`] = await readFile(file);
  }
  files["README.txt"] = strToU8(
    [
      `Експорт на „${org.name}“ (${org.subdomain}) от ${new Date().toISOString()}`,
      "",
      "data/*.csv — всички таблици на организацията (разделител ;, кодиране UTF-8). Суми и количества с десетична точка.",
      "files/ — снимки на артикулите (items/<идентификатор на артикул>/…).",
      "Не са включени: хешове на API ключове и тайни на webhooks.",
    ].join("\r\n"),
  );
  return Buffer.from(zipSync(files, { level: 6 }));
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : Promise.resolve([path.join(dir, e.name)]))));
    return nested.flat();
  } catch {
    return [];
  }
}
