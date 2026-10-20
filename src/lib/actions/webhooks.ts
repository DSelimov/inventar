"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { WEBHOOK_EVENTS, webhooks, type WebhookEvent } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { required, str } from "@/lib/forms";
import { emit } from "@/lib/webhooks";

export async function createWebhook(fd: FormData) {
  const ctx = await requireContext("manage");
  const url = required(str(fd, "url"), "URL");
  if (!/^https?:\/\//.test(url)) throw new Error("URL адресът трябва да започва с http:// или https://.");
  const events = fd.getAll("events").map(String).filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  const [row] = await db
    .insert(webhooks)
    .values({ organizationId: ctx.org.id, url, events, secret: str(fd, "secret") || randomBytes(16).toString("hex") })
    .returning({ id: webhooks.id });
  await audit(ctx, "create", "webhook", row.id, { url, events });
  revalidatePath("/settings/webhooks");
}

export async function toggleWebhook(id: number, active: boolean) {
  const ctx = await requireContext("manage");
  await db.update(webhooks).set({ active }).where(and(eq(webhooks.id, id), eq(webhooks.organizationId, ctx.org.id)));
  revalidatePath("/settings/webhooks");
}

export async function deleteWebhook(id: number) {
  const ctx = await requireContext("manage");
  await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.organizationId, ctx.org.id)));
  await audit(ctx, "delete", "webhook", id);
  revalidatePath("/settings/webhooks");
}

export async function sendTestWebhook() {
  const ctx = await requireContext("manage");
  emit(ctx.org.id, "item.updated", { test: true, message: "Тестово събитие от Инвентар", organization: ctx.org.name });
  revalidatePath("/settings/webhooks");
}
