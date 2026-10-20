/*
 * Архив на всички бази и качените файлове:  pnpm db:backup [--out ./backups] [--keep 14] [--no-files]
 *
 *   backups/2026-10-20_0315/
 *     inventory_control.sql.gz      контролна база
 *     inv_demo.sql.gz …             всяка клиентска база (вкл. спрените)
 *     files.tar.gz                  STORAGE_DIR (снимки на артикули)
 *     manifest.json                 какво е архивирано, размери, грешки
 *
 * --keep N изтрива архивите, по-стари от N дни. Изисква mysqldump (и tar за файловете).
 * Възстановяване: gunzip < inv_demo.sql.gz | mysql -u … inv_demo
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { controlDb } from "./control";
import { organizations } from "./control-schema";
import { closeTenantPools, connFor } from "./tenant";

type Conn = { host: string; port: number; user: string; password: string; database: string };
type Entry = { name: string; file: string; bytes: number; ok: boolean; error?: string };

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function fromUrl(url: string): Conn {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.replace(/^\//, "") };
}

/** mysqldump → gzip → файл. Паролата е в MYSQL_PWD, не в аргументите (не се вижда в ps). */
async function dump(conn: Conn, file: string): Promise<void> {
  const child = spawn(
    "mysqldump",
    ["-h", conn.host, "-P", String(conn.port), "-u", conn.user, "--single-transaction", "--quick", "--routines", "--triggers", "--no-tablespaces", "--default-character-set=utf8mb4", conn.database],
    { env: { ...process.env, MYSQL_PWD: conn.password }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  await pipeline(child.stdout, createGzip({ level: 6 }), createWriteStream(file));
  const code = await exited;
  if (code !== 0) throw new Error(stderr.trim().split("\n").filter((l) => !/Using a password/.test(l)).join(" ") || `mysqldump exit ${code}`);
}

async function tarFiles(dir: string, file: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-czf", file, "-C", dir, "."], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `tar exit ${code}`))));
  });
}

async function prune(root: string, keepDays: number) {
  const cutoff = Date.now() - keepDays * 86_400_000;
  const removed: string[] = [];
  for (const name of await readdir(root).catch(() => [] as string[])) {
    const m = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})$/);
    if (!m) continue;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    if (t < cutoff) {
      await rm(path.join(root, name), { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}

async function main() {
  const root = path.resolve(arg("out") ?? "backups");
  const keep = arg("keep") ? Number(arg("keep")) : null;
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  const dir = path.join(root, stamp);
  await mkdir(dir, { recursive: true });

  const control = fromUrl(process.env.CONTROL_DATABASE_URL ?? "mysql://root:root@localhost:3307/inventory_control");
  const targets: Array<{ name: string; conn: Conn }> = [{ name: control.database, conn: control }];
  for (const org of await controlDb.select().from(organizations)) {
    if (org.status === "failed" || org.status === "provisioning") continue;
    targets.push({ name: org.dbName, conn: connFor(org) });
  }

  const entries: Entry[] = [];
  for (const t of targets) {
    const file = `${t.name}.sql.gz`;
    try {
      await dump(t.conn, path.join(dir, file));
      entries.push({ name: t.name, file, bytes: (await stat(path.join(dir, file))).size, ok: true });
      console.log(`  ${t.name}: ок`);
    } catch (e) {
      entries.push({ name: t.name, file, bytes: 0, ok: false, error: e instanceof Error ? e.message : String(e) });
      console.error(`  ${t.name}: ГРЕШКА ${e instanceof Error ? e.message : e}`);
    }
  }

  const storage = path.resolve(process.env.STORAGE_DIR || "storage");
  if (!process.argv.includes("--no-files") && existsSync(storage)) {
    try {
      await tarFiles(storage, path.join(dir, "files.tar.gz"));
      entries.push({ name: "files", file: "files.tar.gz", bytes: (await stat(path.join(dir, "files.tar.gz"))).size, ok: true });
      console.log("  файлове: ок");
    } catch (e) {
      entries.push({ name: "files", file: "files.tar.gz", bytes: 0, ok: false, error: e instanceof Error ? e.message : String(e) });
      console.error(`  файлове: ГРЕШКА ${e instanceof Error ? e.message : e}`);
    }
  }

  const removed = keep && keep > 0 ? await prune(root, keep) : [];
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ createdAt: now.toISOString(), entries, prunedOlderThanDays: keep, removed }, null, 2));
  const failed = entries.filter((e) => !e.ok);
  console.log(`Архив: ${dir} (${entries.length - failed.length}/${entries.length} успешни${removed.length ? `, изтрити стари: ${removed.join(", ")}` : ""})`);
  await closeTenantPools();
  await controlDb.$client.end();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
