"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { locations, stockLevels } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { bool, optional, required, str } from "@/lib/forms";

export async function createLocation(fd: FormData) {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  const [row] = await db
    .insert(locations)
    .values({ organizationId: ctx.org.id, name, code: optional(fd, "code"), address: optional(fd, "address") })
    .returning({ id: locations.id });
  await audit(ctx, "create", "location", row.id, { name });
  revalidatePath("/settings/locations");
  revalidatePath("/", "layout");
}

export async function updateLocation(id: number, fd: FormData) {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  await db
    .update(locations)
    .set({ name, code: optional(fd, "code"), address: optional(fd, "address"), active: bool(fd, "active") })
    .where(and(eq(locations.id, id), eq(locations.organizationId, ctx.org.id)));
  await audit(ctx, "update", "location", id, { name });
  revalidatePath("/settings/locations");
}

export async function setDefaultLocation(id: number) {
  const ctx = await requireContext("manage");
  await db.transaction(async (tx) => {
    await tx.update(locations).set({ isDefault: false }).where(eq(locations.organizationId, ctx.org.id));
    await tx.update(locations).set({ isDefault: true, active: true }).where(and(eq(locations.id, id), eq(locations.organizationId, ctx.org.id)));
  });
  revalidatePath("/settings/locations");
}

export async function deleteLocation(id: number) {
  const ctx = await requireContext("manage");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(stockLevels)
    .where(and(eq(stockLevels.locationId, id), gt(stockLevels.quantity, 0)));
  if (count > 0) throw new Error("Локацията има наличност. Прехвърлете стоката, преди да я изтриете.");
  await db.delete(locations).where(and(eq(locations.id, id), eq(locations.organizationId, ctx.org.id)));
  await audit(ctx, "delete", "location", id);
  revalidatePath("/settings/locations");
}
