import type { Instrumentation } from "next";

/**
 * При стартиране на сървъра: миграции на контролната и на всички клиентски бази (AUTO_MIGRATE=0 изключва).
 * Неуспешна миграция се записва в лога, но сървърът стартира — /api/health показва състоянието.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./lib/log");
  if (process.env.AUTO_MIGRATE === "0") {
    log.info("migrate.skipped", { reason: "AUTO_MIGRATE=0" });
    return;
  }
  const started = Date.now();
  try {
    const { migrateAll } = await import("./db/migrations");
    const report = await migrateAll();
    const failed = report.tenants.filter((t) => !t.ok);
    (failed.length ? log.warn : log.info)("migrate.done", { tenants: report.tenants.length, failed: failed.map((t) => t.subdomain), ms: Date.now() - started });
    const { setMigrationStatus } = await import("./lib/health");
    setMigrationStatus({ ok: failed.length === 0, at: new Date().toISOString(), failed: failed.map((t) => t.subdomain) });
  } catch (e) {
    log.error("migrate.failed", e);
    const { setMigrationStatus } = await import("./lib/health");
    setMigrationStatus({ ok: false, at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) });
  }
}

/** Всяка необработена грешка на сървъра (страници, server actions, route handlers) → лог (+ Sentry). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./lib/log");
  log.error("request.error", err, { method: request.method, path: request.path.split("?")[0], route: context.routePath, type: context.routeType, host: request.headers.host });
};
