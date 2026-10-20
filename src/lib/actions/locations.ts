"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { locations, stockLevels } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { bool, optional, required, str } from "@/lib/forms";

export async function createLocation(fd: FormData) {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  const [row] = await ctx.db.insert(locations).values({ name, code: optional(fd, "code"), address: optional(fd, "address") }).$returningId();
  await audit(ctx, "create", "location", row.id, { name });
  revalidatePath("/settings/locations");
  revalidatePath("/", "layout");
}

export async function updateLocation(id: number, fd: FormData) {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  await ctx.db.update(locations).set({ name, code: optional(fd, "code"), address: optional(fd, "address"), active: bool(fd, "active") }).where(eq(locations.id, id));
  await audit(ctx, "update", "location", id, { name });
  revalidatePath("/settings/locations");
}

export async function setDefaultLocation(id: number) {
  const ctx = await requireContext("manage");
  await ctx.db.transaction(async (tx) => {
    await tx.update(locations).set({ isDefault: false });
    await tx.update(locations).set({ isDefault: true, active: true }).where(eq(locations.id, id));
  });
  revalidatePath("/settings/locations");
}

export async function deleteLocation(id: number) {
  const ctx = await requireContext("manage");
  const [{ count }] = await ctx.db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(stockLevels)
    .where(and(eq(stockLevels.locationId, id), gt(stockLevels.quantity, 0)));
  if (count > 0) throw new Error("Локацията има наличност. Прехвърлете стоката, преди да я изтриете.");
  await ctx.db.delete(locations).where(eq(locations.id, id));
  await audit(ctx, "delete", "location", id);
  revalidatePath("/settings/locations");
}
