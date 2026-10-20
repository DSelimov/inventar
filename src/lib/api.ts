import "server-only";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys, type ApiScope } from "@/db/schema";
import { sha256 } from "./auth";

export type ApiContext = { orgId: number; scopes: ApiScope[]; keyId: number };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function authenticate(req: Request, needed: ApiScope = "read"): Promise<ApiContext> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "Липсва Authorization: Bearer <api key>.");
  const key = await db.query.apiKeys.findFirst({ where: eq(apiKeys.keyHash, sha256(token)) });
  if (!key) throw new ApiError(401, "Невалиден API ключ.");
  const scopes = key.scopes as ApiScope[];
  if (!scopes.includes(needed)) throw new ApiError(403, `Ключът няма право „${needed}“.`);
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return { orgId: key.organizationId, scopes, keyId: key.id };
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Wraps a handler: authenticates, catches ApiError/Error into JSON responses. */
export function handler<T extends unknown[]>(
  scope: ApiScope,
  fn: (req: Request, ctx: ApiContext, ...rest: T) => Promise<Response>,
) {
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
