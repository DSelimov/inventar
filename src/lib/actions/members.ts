"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { memberships, ROLES, users, type Role } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashPassword, requireContext } from "@/lib/auth";
import { oneOf, required, str } from "@/lib/forms";
import { can } from "@/lib/permissions";

function assertCanAssign(actorRole: Role, target: Role) {
  if (target === "owner" && actorRole !== "owner") throw new Error("Само собственик може да дава роля „Собственик“.");
}

export async function addMember(fd: FormData) {
  const ctx = await requireContext("manage");
  const email = required(str(fd, "email"), "Имейл").toLowerCase();
  const name = required(str(fd, "name"), "Име");
  const role = oneOf(fd, "role", ROLES, "staff");
  assertCanAssign(ctx.role, role);

  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    const password = str(fd, "password");
    if (password.length < 8) throw new Error("Задайте начална парола от поне 8 знака за новия потребител.");
    [user] = await db.insert(users).values({ email, name, passwordHash: hashPassword(password) }).returning();
  }
  const existing = await db.query.memberships.findFirst({ where: and(eq(memberships.userId, user.id), eq(memberships.organizationId, ctx.org.id)) });
  if (existing) throw new Error("Този потребител вече е член на организацията.");
  await db.insert(memberships).values({ userId: user.id, organizationId: ctx.org.id, role });
  await audit(ctx, "invite", "user", user.id, { email, role });
  revalidatePath("/settings/users");
}

export async function changeRole(membershipId: number, fd: FormData) {
  const ctx = await requireContext("manage");
  const role = oneOf(fd, "role", ROLES, "staff");
  assertCanAssign(ctx.role, role);
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id)) });
  if (!m) throw new Error("Членството не е намерено.");
  if (m.role === "owner" && !can(ctx.role, "owner")) throw new Error("Само собственик може да променя друг собственик.");
  if (m.role === "owner" && role !== "owner") {
    const owners = await db.query.memberships.findMany({ where: and(eq(memberships.organizationId, ctx.org.id), eq(memberships.role, "owner")) });
    if (owners.length <= 1) throw new Error("Организацията трябва да има поне един собственик.");
  }
  await db.update(memberships).set({ role }).where(eq(memberships.id, membershipId));
  await audit(ctx, "role", "user", m.userId, { role });
  revalidatePath("/settings/users");
}

export async function removeMember(membershipId: number) {
  const ctx = await requireContext("manage");
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id)) });
  if (!m) throw new Error("Членството не е намерено.");
  if (m.userId === ctx.user.id) throw new Error("Не можете да премахнете себе си.");
  if (m.role === "owner") throw new Error("Първо сменете ролята на собственика.");
  await db.delete(memberships).where(eq(memberships.id, membershipId));
  await audit(ctx, "remove_member", "user", m.userId);
  revalidatePath("/settings/users");
}

export async function changeOwnPassword(fd: FormData) {
  const ctx = await requireContext("read");
  const password = str(fd, "password");
  if (password.length < 8) throw new Error("Паролата трябва да е поне 8 знака.");
  await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, ctx.user.id));
  revalidatePath("/settings");
}
