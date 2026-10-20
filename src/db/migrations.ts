/* Прилагане на миграциите: контролна база, после всяка клиентска база. Използва се от
 * pnpm db:migrate и при стартиране на сървъра (src/instrumentation.ts). */
import { migrate } from "drizzle-orm/mysql2/migrator";
import path from "node:path";
import { log } from "@/lib/log";
import { controlDb } from "./control";
import { organizations } from "./control-schema";
import { getTenantDb, migrateTenantDb } from "./tenant";

export type MigrationReport = { control: "ok"; tenants: Array<{ subdomain: string; dbName: string; ok: boolean; error?: string }> };

/**
 * Мигрира всичко. Заключване в MySQL (GET_LOCK), за да не мигрират два процеса едновременно
 * (напр. рестарт по време на деплой). Грешка в една клиентска база не спира останалите.
 */
export async function migrateAll(): Promise<MigrationReport> {
  const conn = await controlDb.$client.getConnection();
  try {
    const [[{ got }]] = (await conn.query("SELECT GET_LOCK('inventar_migrate', 120) AS got")) as unknown as [[{ got: number }]];
    if (got !== 1) throw new Error("Друг процес прилага миграциите (изтече изчакването на заключването).");
    await migrate(controlDb, { migrationsFolder: path.join(process.cwd(), "drizzle", "control") });
    const orgs = await controlDb.select().from(organizations);
    const tenants: MigrationReport["tenants"] = [];
    for (const org of orgs) {
      if (org.status === "failed" || org.status === "provisioning") continue;
      try {
        await migrateTenantDb(getTenantDb(org));
        tenants.push({ subdomain: org.subdomain, dbName: org.dbName, ok: true });
      } catch (e) {
        log.error("migrate.tenant_failed", e, { subdomain: org.subdomain, dbName: org.dbName });
        tenants.push({ subdomain: org.subdomain, dbName: org.dbName, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { control: "ok", tenants };
  } finally {
    await conn.query("SELECT RELEASE_LOCK('inventar_migrate')").catch(() => {});
    conn.release();
  }
}

