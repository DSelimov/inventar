import { log } from "@/lib/log";

/** Грешки от браузъра (src/app/error.tsx) → лог. До 20 на минута от IP адрес, за да не се пълни логът. */
const g = globalThis as unknown as { __clientErrors?: Map<string, { start: number; count: number }> };
const seen = (g.__clientErrors ??= new Map());

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const w = seen.get(ip);
  if (!w || now - w.start > 60_000) seen.set(ip, { start: now, count: 1 });
  else if (++w.count > 20) return new Response(null, { status: 429 });
  if (seen.size > 5000) seen.clear();

  const body = (await req.json().catch(() => ({}))) as { message?: unknown; stack?: unknown; path?: unknown };
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const err = Object.assign(new Error(clip(body.message, 500) ?? "Неизвестна грешка"), { name: "ClientError", stack: clip(body.stack, 2000) });
  log.error("client.error", err, { path: clip(body.path, 300), host: req.headers.get("host"), userAgent: clip(req.headers.get("user-agent"), 200) });
  return new Response(null, { status: 204 });
}
