"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { WEBHOOK_EVENTS, webhooks, type WebhookEvent } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { required, str } from "@/lib/forms";
import { emit } from "@/lib/webhooks";

export async function createWebhook(fd: FormData) {
  const ctx = await requireContext("manage");
  const url = required(str(fd, "url"), "URL");
  if (!/^https?:\/\//.test(url)) throw new Error("URL адресът трябва да започва с http:// или https://.");
  const events = fd.getAll("events").map(String).filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  const [row] = await ctx.db.insert(webhooks).values({ url, events, secret: str(fd, "secret") || randomBytes(16).toString("hex") }).$returningId();
  await audit(ctx, "create", "webhook", row.id, { url, events });
  revalidatePath("/settings/webhooks");
}

export async function toggleWebhook(id: number, active: boolean) {
  const ctx = await requireContext("manage");
  await ctx.db.update(webhooks).set({ active }).where(eq(webhooks.id, id));
  revalidatePath("/settings/webhooks");
}

export async function deleteWebhook(id: number) {
  const ctx = await requireContext("manage");
  await ctx.db.delete(webhooks).where(eq(webhooks.id, id));
  await audit(ctx, "delete", "webhook", id);
  revalidatePath("/settings/webhooks");
}

export async function sendTestWebhook() {
  const ctx = await requireContext("manage");
  emit(ctx.db, "item.updated", { test: true, message: "Тестово събитие от Инвентар", organization: ctx.org.name });
  revalidatePath("/settings/webhooks");
}
