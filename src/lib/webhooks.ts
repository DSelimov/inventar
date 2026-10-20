import "server-only";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import type { Db } from "@/db/tenant";
import { webhookDeliveries, webhooks, type WebhookEvent } from "@/db/tenant-schema";

export { WEBHOOK_EVENT_LABELS } from "./webhook-labels";

/** Планира webhook събитие; доставя се след като отговорът е изпратен. */
export function emit(db: Db, event: WebhookEvent, payload: Record<string, unknown>) {
  try {
    after(() => deliver(db, event, payload));
  } catch {
    void deliver(db, event, payload);
  }
}

async function deliver(db: Db, event: WebhookEvent, payload: Record<string, unknown>) {
  const hooks = await db.select().from(webhooks).where(eq(webhooks.active, true));
  const body = JSON.stringify({ event, createdAt: new Date().toISOString(), data: payload });

  await Promise.all(
    hooks
      .filter((h) => h.events.length === 0 || h.events.includes(event))
      .map(async (hook) => {
        const signature = createHmac("sha256", hook.secret).update(body).digest("hex");
        let statusCode: number | null = null;
        let success = false;
        let error: string | null = null;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(hook.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Inventory-Event": event, "X-Inventory-Signature": `sha256=${signature}` },
            body,
            signal: controller.signal,
          });
          clearTimeout(timer);
          statusCode = res.status;
          success = res.ok;
          if (!res.ok) error = `HTTP ${res.status}`;
        } catch (e) {
          error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        }
        await db.insert(webhookDeliveries).values({ webhookId: hook.id, event, payload: JSON.parse(body), statusCode, success, error });
      }),
  );
}
