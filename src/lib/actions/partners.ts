"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PARTNER_TYPES, partners } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { oneOf, optional, optionalInt, required, str } from "@/lib/forms";
import { act, redirectWith } from "@/lib/action";

function read(fd: FormData) {
  return {
    name: required(str(fd, "name"), "Име"),
    type: oneOf(fd, "type", PARTNER_TYPES, "both"),
    contactName: optional(fd, "contactName"),
    email: optional(fd, "email"),
    phone: optional(fd, "phone"),
    address: optional(fd, "address"),
    vatNumber: optional(fd, "vatNumber"),
    leadTimeDays: optionalInt(fd, "leadTimeDays"),
    notes: optional(fd, "notes"),
  };
}

export const createPartner = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const data = read(fd);
  const [row] = await ctx.db.insert(partners).values(data).$returningId();
  await audit(ctx, "create", "partner", row.id, { name: data.name });
  revalidatePath("/partners");
  return redirectWith(`/partners/${row.id}`, "Партньорът е създаден.");
});

export const updatePartner = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const data = read(fd);
  await ctx.db.update(partners).set(data).where(eq(partners.id, id));
  await audit(ctx, "update", "partner", id, { name: data.name });
  revalidatePath("/partners");
  revalidatePath(`/partners/${id}`);
  return "Партньорът е запазен.";
});

export const deletePartner = act(async (id: number) => {
  const ctx = await requireContext("delete");
  await ctx.db.delete(partners).where(eq(partners.id, id));
  await audit(ctx, "delete", "partner", id);
  revalidatePath("/partners");
  return redirectWith("/partners", "Партньорът е изтрит.");
});
