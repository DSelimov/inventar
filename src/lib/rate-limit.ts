import "server-only";
import { eq, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { controlDb } from "@/db/control";
import { rateLimits } from "@/db/control-schema";

/**
 * Ограничаване на опити с фиксиран прозорец, пазено в контролната база — важи след рестарт
 * и при повече от един процес. За вход и заявки за нова парола; API-то има собствен лимит в паметта.
 */
export type Limit = { key: string; max: number; windowMs: number };

/** Колко секунди остават до отключване (0 = позволено). */
export async function retryAfter(limit: Limit): Promise<number> {
  const [row] = await controlDb.select().from(rateLimits).where(eq(rateLimits.key, limit.key)).limit(1);
  if (!row) return 0;
  const ends = row.windowStart.getTime() + limit.windowMs;
  if (ends <= Date.now() || row.hits < limit.max) return 0;
  return Math.ceil((ends - Date.now()) / 1000);
}

/** Отчита един опит (нов прозорец, ако старият е изтекъл). */
export async function hit(limit: Limit) {
  const now = new Date();
  const expired = new Date(now.getTime() - limit.windowMs);
  await controlDb
    .insert(rateLimits)
    .values({ key: limit.key, hits: 1, windowStart: now })
    .onDuplicateKeyUpdate({
      set: {
        // MySQL прилага присвояванията отляво надясно: hits вижда стария window_start
        hits: sql`if(${rateLimits.windowStart} < ${expired}, 1, ${rateLimits.hits} + 1)`,
        windowStart: sql`if(${rateLimits.windowStart} < ${expired}, ${now}, ${rateLimits.windowStart})`,
      },
    });
  if (Math.random() < 0.01) await controlDb.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 86_400_000)));
}

export async function clear(key: string) {
  await controlDb.delete(rateLimits).where(eq(rateLimits.key, key));
}

/** IP на клиента: първият адрес от X-Forwarded-For (зад прокси на хостинга), иначе X-Real-IP. */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
