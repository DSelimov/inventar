import "server-only";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Organization } from "@/db/control-schema";
import { getTenantDb, type TenantDb } from "@/db/tenant";
import { apiKeys, type ApiScope } from "@/db/tenant-schema";
import { sha256 } from "./auth-crypto";
import { tenantFromRequest } from "./tenant";

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

export function handler<T extends unknown[]>(scope: ApiScope, fn: (req: Request, ctx: ApiContext, ...rest: T) => Promise<Response>) {
  return async (req: Request, ...rest: T) => {
    try {
      const ctx = await authenticate(req, scope);
      return await fn(req, ctx, ...rest);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      return json({ error: e instanceof Error ? e.message : "Грешка" }, 400);
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
