"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { calendarEvents, EVENT_TYPES } from "@/db/schema";
import { requireContext } from "@/lib/auth";
import { oneOf, optional, required, str } from "@/lib/forms";

export async function createEvent(fd: FormData) {
  const ctx = await requireContext("write");
  const title = required(str(fd, "title"), "Заглавие");
  const date = required(str(fd, "date"), "Дата");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Датата трябва да е във формат ГГГГ-ММ-ДД.");
  await db.insert(calendarEvents).values({ organizationId: ctx.org.id, title, date, type: oneOf(fd, "type", EVENT_TYPES, "event"), notes: optional(fd, "notes") });
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function deleteEvent(id: number) {
  const ctx = await requireContext("write");
  await db.delete(calendarEvents).where(and(eq(calendarEvents.id, id), eq(calendarEvents.organizationId, ctx.org.id)));
  revalidatePath("/calendar");
  revalidatePath("/");
}
