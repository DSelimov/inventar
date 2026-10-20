"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { apiKeys, type ApiScope } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext, sha256 } from "@/lib/auth";
import { bool, required, str } from "@/lib/forms";
import { act } from "@/lib/action";

export const createApiKey = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  const scopes: ApiScope[] = bool(fd, "write") ? ["read", "write"] : ["read"];
  const plain = `inv_${randomBytes(24).toString("hex")}`;
  const [row] = await ctx.db.insert(apiKeys).values({ name, prefix: plain.slice(0, 12), keyHash: sha256(plain), scopes, createdBy: ctx.user.id }).$returningId();
  await audit(ctx, "create", "api_key", row.id, { name, scopes });
  (await cookies()).set("inv_new_key", plain, { httpOnly: true, sameSite: "lax", maxAge: 60, path: "/" });
  revalidatePath("/settings/api");
  return "API ключът е създаден. Копирайте го сега — няма да се покаже отново.";
});

export const deleteApiKey = act(async (id: number) => {
  const ctx = await requireContext("manage");
  await ctx.db.delete(apiKeys).where(eq(apiKeys.id, id));
  await audit(ctx, "delete", "api_key", id);
  revalidatePath("/settings/api");
  return "API ключът е изтрит.";
});

export async function readNewKeyOnce(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("inv_new_key")?.value ?? null;
}
