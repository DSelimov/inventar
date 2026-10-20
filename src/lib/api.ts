import "server-only";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Organization } from "@/db/control-schema";
import { getTenantDb, type TenantDb } from "@/db/tenant";
import { apiKeys, type ApiScope } from "@/db/tenant-schema";
import { sha256 } from "./auth-crypto";
import { UserError } from "./errors";
import { tenantFromRequest } from "./tenant";
import { log } from "@/lib/log";

export type ApiContext = { db: TenantDb; org: Organization; scopes: ApiScope[]; keyId: number };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Клиентът се определя от поддомейна на заявката; ключът се търси в неговата база. */
export async function authenticate(req: Request, needed: ApiScope = "read"): Promise<ApiContext> {
  const org = await tenantFromRequest(req);
  if (!org) throw new ApiError(404, "Непознат поддомейн. API адресът е https://<фирма>.<домейн>/api/v1/…");
  if (org.status === "suspended") throw new ApiError(503, "Организацията е спряна. Свържете се с администратора на системата.");
  if (org.status !== "active") throw new ApiError(503, "Организацията все още се подготвя.");
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "Липсва Authorization: Bearer <api key>.");
  const db = getTenantDb(org);
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, sha256(token))).limit(1);
  if (!key) throw new ApiError(401, "Невалиден API ключ.");
  if (!key.scopes.includes(needed)) throw new ApiError(403, `Ключът няма право „${needed}“.`);
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return { db, org, scopes: key.scopes, keyId: key.id };
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// ------------------------------------------------------------ rate limiting
/** Заявки на минута за един API ключ (API_RATE_LIMIT, по подразбиране 600). В паметта на процеса. */
export const API_RATE_LIMIT = Number(process.env.API_RATE_LIMIT) || 600;
const WINDOW_MS = 60_000;
const g = globalThis as unknown as { __apiWindows?: Map<string, { start: number; count: number }> };
const windows = (g.__apiWindows ??= new Map());

function takeToken(key: string) {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) {
    w = { start: now, count: 0 };
    windows.set(key, w);
    if (windows.size > 10_000) for (const [k, v] of windows) if (now - v.start >= WINDOW_MS) windows.delete(k);
  }
  w.count++;
  const reset = Math.ceil((w.start + WINDOW_MS) / 1000);
  return { limited: w.count > API_RATE_LIMIT, remaining: Math.max(0, API_RATE_LIMIT - w.count), reset, retryAfter: Math.max(1, reset - Math.floor(now / 1000)) };
}

/** Грешки от MySQL, причинени от данните в заявката (без да издаваме детайли за базата). */
function dbError(e: unknown): { status: number; message: string } | null {
  const code = ((e as { cause?: { code?: string } })?.cause ?? (e as { code?: string }))?.code;
  if (code === "ER_DUP_ENTRY") return { status: 409, message: "Вече има запис с тази уникална стойност (напр. sku)." };
  if (code === "ER_NO_REFERENCED_ROW_2" || code === "ER_NO_REFERENCED_ROW") return { status: 422, message: "Препратка към несъществуващ запис (проверете идентификаторите, напр. categoryId)." };
  if (code === "ER_ROW_IS_REFERENCED_2" || code === "ER_ROW_IS_REFERENCED") return { status: 409, message: "Записът се използва от други записи и не може да бъде изтрит." };
  if (code && /^(ER_BAD_NULL_ERROR|ER_TRUNCATED_WRONG_VALUE|WARN_DATA_TRUNCATED|ER_DATA_TOO_LONG|ER_WARN_DATA_OUT_OF_RANGE|ER_TRUNCATED_WRONG_VALUE_FOR_FIELD)/.test(code)) {
    return { status: 422, message: "Невалидна стойност на поле (тип, дължина или липсващо задължително поле)." };
  }
  return null;
}

export function handler<T extends unknown[]>(scope: ApiScope, fn: (req: Request, ctx: ApiContext, ...rest: T) => Promise<Response>) {
  return async (req: Request, ...rest: T) => {
    let rate: ReturnType<typeof takeToken> | null = null;
    const withRateHeaders = (res: Response) => {
      if (rate) {
        res.headers.set("X-RateLimit-Limit", String(API_RATE_LIMIT));
        res.headers.set("X-RateLimit-Remaining", String(rate.remaining));
        res.headers.set("X-RateLimit-Reset", String(rate.reset));
      }
      return res;
    };
    try {
      const ctx = await authenticate(req, scope);
      rate = takeToken(`${ctx.org.id}:${ctx.keyId}`);
      if (rate.limited) {
        const res = json({ error: `Превишен лимит от ${API_RATE_LIMIT} заявки в минута за този ключ. Опитайте след ${rate.retryAfter} с.` }, 429);
        res.headers.set("Retry-After", String(rate.retryAfter));
        return withRateHeaders(res);
      }
      return withRateHeaders(await fn(req, ctx, ...rest));
    } catch (e) {
      if (e instanceof ApiError) return withRateHeaders(json({ error: e.message }, e.status));
      if (e instanceof UserError) return withRateHeaders(json({ error: e.message }, 400));
      const db = dbError(e);
      if (db) return withRateHeaders(json({ error: db.message }, db.status));
      // неочаквана грешка: детайлите само в лога, не към клиента
      log.error("api.unhandled", e, { method: req.method, path: new URL(req.url).pathname });
      return withRateHeaders(json({ error: "Вътрешна грешка на сървъра." }, 500));
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Тялото трябва да е валиден JSON.");
  }
}

export async function paramId(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) throw new ApiError(400, "Невалиден идентификатор.");
  return id;
}
