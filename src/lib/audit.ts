import "server-only";
import { and, desc, eq, gte, like, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { auditLog } from "@/db/tenant-schema";
import type { Context } from "./auth";
import { offsetOf, PAGE_SIZE } from "./paging";

export async function audit(ctx: Pick<Context, "db" | "user">, action: string, entity: string, entityId: number | null = null, details: Record<string, unknown> | null = null) {
  await ctx.db.insert(auditLog).values({ userId: ctx.user.id, userName: ctx.user.name, action, entity, entityId, details });
}

export type AuditFilters = { action?: string; entity?: string; user?: string; q?: string; from?: string; to?: string };

export async function pageAudit(db: Db, f: AuditFilters, page: number) {
  const conds = [];
  if (f.action) conds.push(eq(auditLog.action, f.action));
  if (f.entity) conds.push(eq(auditLog.entity, f.entity));
  if (f.user) conds.push(like(auditLog.userName, `%${f.user}%`));
  if (f.q) conds.push(like(sql`cast(${auditLog.details} as char)`, `%${f.q}%`));
  if (f.from) conds.push(gte(auditLog.createdAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to) conds.push(lt(auditLog.createdAt, new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000)));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auditLog).where(where).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(PAGE_SIZE).offset(offsetOf(page)),
    db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(auditLog).where(where),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: "Създаване",
  update: "Промяна",
  delete: "Изтриване",
  status: "Смяна на статус",
  movement: "Складово движение",
  transfer: "Трансфер",
  import: "Импорт",
  login: "Вход",
  invite: "Добавен потребител",
  role: "Смяна на роля",
  remove_member: "Премахнат потребител",
  "2fa_enabled": "Включена 2FA",
  "2fa_disabled": "Изключена 2FA",
  "2fa_recovery_codes": "Нови кодове за 2FA",
};

export const ENTITY_LABELS: Record<string, string> = {
  item: "Артикул",
  category: "Категория",
  field: "Поле",
  shipment: "Пратка",
  order: "Поръчка",
  partner: "Партньор",
  collection: "Колекция",
  event: "Събитие",
  location: "Локация",
  settings: "Настройки",
  user: "Потребител",
  api_key: "API ключ",
  webhook: "Webhook",
  organization: "Организация",
  lot: "Партида",
  stock_count: "Инвентаризация",
};
