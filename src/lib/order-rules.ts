import "server-only";
import { inArray } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import type { Role } from "@/db/schema";
import { items } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { toBase } from "./fx";
import { can } from "./permissions";

/**
 * Минимална продажна цена: ред под нея (в основната валута) се приема само от администратор/собственик.
 * Връща нарушенията (за съобщението) или хвърля грешка за останалите роли.
 */
export async function assertMinPrices(ctx: { db: Db; role: Role }, type: string, lines: Array<{ itemId: number; unitPrice: number }>, doc: { currency?: string | null; exchangeRate?: number | null }) {
  if (type !== "sales" || lines.length === 0) return;
  const rows = await ctx.db.select({ id: items.id, name: items.name, minPrice: items.minPrice }).from(items).where(inArray(items.id, lines.map((l) => l.itemId)));
  const below = lines
    .map((l) => ({ l, it: rows.find((r) => r.id === l.itemId) }))
    .filter(({ l, it }) => it?.minPrice != null && toBase(l.unitPrice, doc) < it.minPrice);
  if (below.length && !can(ctx.role, "manage")) {
    throw new UserError(`Под минималната цена: ${below.map(({ it }) => `„${it!.name}“ (мин. ${it!.minPrice})`).join(", ")}. Само администратор може да продава под нея.`);
  }
}

