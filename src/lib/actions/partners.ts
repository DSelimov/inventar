"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { PARTNER_TYPES, partners } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { oneOf, optional, optionalInt, required, str } from "@/lib/forms";

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

export async function createPartner(fd: FormData) {
  const ctx = await requireContext("write");
  const data = read(fd);
  const [row] = await db.insert(partners).values({ ...data, organizationId: ctx.org.id }).returning({ id: partners.id });
  await audit(ctx, "create", "partner", row.id, { name: data.name });
  revalidatePath("/partners");
  redirect(`/partners/${row.id}`);
}

export async function updatePartner(id: number, fd: FormData) {
  const ctx = await requireContext("write");
  const data = read(fd);
  await db.update(partners).set(data).where(and(eq(partners.id, id), eq(partners.organizationId, ctx.org.id)));
  await audit(ctx, "update", "partner", id, { name: data.name });
  revalidatePath("/partners");
  revalidatePath(`/partners/${id}`);
}

export async function deletePartner(id: number) {
  const ctx = await requireContext("delete");
  await db.delete(partners).where(and(eq(partners.id, id), eq(partners.organizationId, ctx.org.id)));
  await audit(ctx, "delete", "partner", id);
  revalidatePath("/partners");
  redirect("/partners");
}
