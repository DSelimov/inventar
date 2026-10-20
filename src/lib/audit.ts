import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import type { Context } from "./auth";

export async function audit(
  ctx: Pick<Context, "org" | "user">,
  action: string,
  entity: string,
  entityId: number | null = null,
  details: Record<string, unknown> | null = null,
) {
  await db.insert(auditLog).values({
    organizationId: ctx.org.id,
    userId: ctx.user.id,
    action,
    entity,
    entityId,
    details,
  });
}

export async function listAudit(organizationId: number, limit = 200) {
  return db.query.auditLog.findMany({
    where: eq(auditLog.organizationId, organizationId),
    orderBy: [desc(auditLog.createdAt), desc(auditLog.id)],
    limit,
    with: { user: true },
  });
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
