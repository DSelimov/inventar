import "server-only";
import { desc } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { auditLog } from "@/db/tenant-schema";
import type { Context } from "./auth";

export async function audit(ctx: Pick<Context, "db" | "user">, action: string, entity: string, entityId: number | null = null, details: Record<string, unknown> | null = null) {
  await ctx.db.insert(auditLog).values({ userId: ctx.user.id, userName: ctx.user.name, action, entity, entityId, details });
}

export async function listAudit(db: Db, limit = 200) {
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(limit);
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
};
