"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { calendarEvents, EVENT_TYPES } from "@/db/schema";
import { oneOf, optional, required, str } from "@/lib/forms";

export async function createEvent(fd: FormData) {
  const title = required(str(fd, "title"), "Заглавие");
  const date = required(str(fd, "date"), "Дата");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Датата трябва да е във формат ГГГГ-ММ-ДД.");
  await db.insert(calendarEvents).values({
    title,
    date,
    type: oneOf(fd, "type", EVENT_TYPES, "event"),
    notes: optional(fd, "notes"),
  });
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function deleteEvent(id: number) {
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  revalidatePath("/calendar");
  revalidatePath("/");
}
