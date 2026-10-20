/**
 * Структуриран лог: един JSON ред на запис в stdout/stderr (Hostinger/PM2/systemd ги събират).
 *   log.info("migrate.done", { tenants: 3 })
 *   log.error("api.unhandled", err, { path })
 * При зададен SENTRY_DSN грешките се изпращат и към Sentry (без SDK, през envelope API).
 */
type Fields = Record<string, unknown>;
type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;

function serializeError(err: unknown) {
  if (!(err instanceof Error)) return { message: String(err) };
  const digest = (err as { digest?: string }).digest;
  const cause = err.cause instanceof Error ? { name: err.cause.name, message: err.cause.message } : undefined;
  return { name: err.name, message: err.message, stack: err.stack?.split("\n").slice(0, 12).join("\n"), ...(digest ? { digest } : {}), ...(cause ? { cause } : {}) };
}

function write(level: Level, msg: string, fields?: Fields) {
  if (LEVELS[level] < min) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const log = {
  debug: (msg: string, fields?: Fields) => write("debug", msg, fields),
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error(msg: string, err?: unknown, fields?: Fields) {
    write("error", msg, { ...fields, ...(err !== undefined ? { error: serializeError(err) } : {}) });
    if (process.env.SENTRY_DSN) void reportToSentry(msg, err, fields);
  },
};

// ------------------------------------------------------------------ Sentry
/** Изпраща грешка към Sentry по DSN (https://<key>@<host>/<project>). Грешките при изпращане се игнорират. */
export async function reportToSentry(msg: string, err: unknown, fields?: Fields) {
  try {
    const dsn = new URL(process.env.SENTRY_DSN!);
    const project = dsn.pathname.replace(/^\//, "");
    const url = `${dsn.protocol}//${dsn.host}/api/${project}/envelope/`;
    const e = serializeError(err ?? msg);
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      logger: "inventar",
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.APP_VERSION,
      message: msg,
      exception: { values: [{ type: "name" in e ? e.name : "Error", value: e.message, mechanism: { type: "generic", handled: true } }] },
      extra: { ...fields, stack: "stack" in e ? e.stack : undefined },
    };
    const body = [JSON.stringify({ event_id: eventId, dsn: dsn.toString(), sent_at: new Date().toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.username}, sentry_client=inventar/1.0` },
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // мониторингът не бива да чупи приложението
  }
}
