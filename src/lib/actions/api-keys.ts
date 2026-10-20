"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireContext, sha256 } from "@/lib/auth";
import { bool, required, str } from "@/lib/forms";

export async function createApiKey(fd: FormData) {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  const scopes = bool(fd, "write") ? ["read", "write"] : ["read"];
  const plain = `inv_${randomBytes(24).toString("hex")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({ organizationId: ctx.org.id, name, prefix: plain.slice(0, 12), keyHash: sha256(plain), scopes, createdBy: ctx.user.id })
    .returning({ id: apiKeys.id });
  await audit(ctx, "create", "api_key", row.id, { name, scopes });
  // Shown exactly once on the next render of the settings page.
  (await cookies()).set("inv_new_key", plain, { httpOnly: true, sameSite: "lax", maxAge: 60, path: "/" });
  revalidatePath("/settings/api");
}

export async function deleteApiKey(id: number) {
  const ctx = await requireContext("manage");
  await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, ctx.org.id)));
  await audit(ctx, "delete", "api_key", id);
  revalidatePath("/settings/api");
}

export async function readNewKeyOnce(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get("inv_new_key")?.value ?? null;
  return v;
}
