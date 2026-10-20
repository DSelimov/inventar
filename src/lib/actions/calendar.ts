"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { calendarEvents, EVENT_TYPES } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { oneOf, optional, required, str } from "@/lib/forms";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";

export const createEvent = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const title = required(str(fd, "title"), "Заглавие");
  const date = required(str(fd, "date"), "Дата");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("Датата трябва да е във формат ГГГГ-ММ-ДД.");
  await ctx.db.insert(calendarEvents).values({ title, date, type: oneOf(fd, "type", EVENT_TYPES, "event"), notes: optional(fd, "notes") });
  revalidatePath("/calendar");
  revalidatePath("/");
  return "Събитието е добавено.";
});

export const deleteEvent = act(async (id: number) => {
  const ctx = await requireContext("write");
  await ctx.db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  revalidatePath("/calendar");
  revalidatePath("/");
  return "Събитието е изтрито.";
});
