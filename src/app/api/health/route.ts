import { sql } from "drizzle-orm";
import { controlDb } from "@/db/control";
import { tenantPoolCount } from "@/db/tenant";
import { migrationStatus, startedAt } from "@/lib/health";
import { log } from "@/lib/log";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

/** Без автентикация: за мониторинг на хостинга (uptime проверки). 200 = ок, 503 = контролната база не отговаря. */
export async function GET() {
  const t0 = Date.now();
  let db: { ok: boolean; ms?: number; error?: string };
  try {
    await controlDb.execute(sql`select 1`);
    db = { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    log.error("health.db_failed", e);
    db = { ok: false, error: "Контролната база не отговаря." };
  }
  const migrations = migrationStatus();
  const body = {
    status: db.ok ? "ok" : "error",
    version: pkg.version,
    commit: process.env.APP_COMMIT ?? null,
    uptimeSeconds: Math.round((Date.now() - startedAt()) / 1000),
    controlDb: db,
    tenantPools: tenantPoolCount(),
    migrations: migrations && { ok: migrations.ok, at: migrations.at, failedTenants: migrations.failed?.length ?? 0 },
  };
  return Response.json(body, { status: db.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
