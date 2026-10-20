"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { bool, str } from "@/lib/forms";

export async function saveSettings(fd: FormData) {
  const entries: Record<string, string> = {
    companyName: str(fd, "companyName") || "Моята фирма",
    currency: (str(fd, "currency") || "EUR").toUpperCase().slice(0, 3),
    lowStockAlerts: String(bool(fd, "lowStockAlerts")),
  };
  for (const [key, value] of Object.entries(entries)) {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }
  revalidatePath("/", "layout");
}
