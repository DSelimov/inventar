"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { bool, int, str } from "@/lib/forms";
import { setSetting } from "@/lib/settings";

export async function saveOrganization(fd: FormData) {
  const ctx = await requireContext("manage");
  const name = str(fd, "name") || ctx.org.name;
  const currency = (str(fd, "currency") || "EUR").toUpperCase().slice(0, 3);
  await db.update(organizations).set({ name, currency }).where(eq(organizations.id, ctx.org.id));
  await setSetting(ctx.org.id, "lowStockAlerts", String(bool(fd, "lowStockAlerts")));
  await audit(ctx, "update", "organization", ctx.org.id, { name, currency });
  revalidatePath("/", "layout");
}

export async function saveReportParameters(fd: FormData) {
  const ctx = await requireContext("manage");
  const params = {
    windowDays: int(fd, "windowDays", 30),
    deadStockDays: int(fd, "deadStockDays", 90),
    leadTimeDays: int(fd, "leadTimeDays", 7),
    safetyDays: int(fd, "safetyDays", 7),
    targetMarginPct: int(fd, "targetMarginPct", 30),
  };
  for (const [key, value] of Object.entries(params)) {
    if (value <= 0) throw new Error("Всички параметри трябва да са положителни числа.");
    await setSetting(ctx.org.id, key, String(value));
  }
  await audit(ctx, "update", "settings", null, params);
  revalidatePath("/reports");
  revalidatePath("/settings");
}
