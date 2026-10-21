import type { WebhookEvent } from "@/db/schema";

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "item.created": "Създаден артикул",
  "item.updated": "Променен артикул",
  "item.low_stock": "Ниска наличност",
  "movement.created": "Складово движение",
  "shipment.created": "Създадена пратка",
  "shipment.status_changed": "Сменен статус на пратка",
  "order.created": "Създадена поръчка",
  "order.status_changed": "Сменен статус на поръчка",
  "invoice.issued": "Издаден документ (фактура, известие)",
  "invoice.paid": "Платена фактура",
};
