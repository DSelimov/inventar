import "server-only";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { webhookDeliveries, webhooks, type WebhookEvent } from "@/db/schema";

/**
 * Queue a webhook event. Delivery happens after the response is sent (`after`),
 * so a slow endpoint never slows down the user.
 */
export function emit(organizationId: number, event: WebhookEvent, payload: Record<string, unknown>) {
  try {
    after(() => deliver(organizationId, event, payload));
  } catch {
    // `after` is unavailable outside a request scope (e.g. seed script): deliver inline.
    void deliver(organizationId, event, payload);
  }
}

async function deliver(organizationId: number, event: WebhookEvent, payload: Record<string, unknown>) {
  const hooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.organizationId, organizationId), eq(webhooks.active, true)));
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
            headers: {
              "Content-Type": "application/json",
              "X-Inventory-Event": event,
              "X-Inventory-Signature": `sha256=${signature}`,
            },
            body,
            signal: controller.signal,
          });
          clearTimeout(timer);
          statusCode = res.status;
          success = res.ok;
          if (!res.ok) error = `HTTP ${res.status}`;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        await db.insert(webhookDeliveries).values({
          webhookId: hook.id,
          event,
          payload: JSON.parse(body),
          statusCode,
          success,
          error,
        });
      }),
  );
}

export { WEBHOOK_EVENT_LABELS } from "./webhook-labels";
