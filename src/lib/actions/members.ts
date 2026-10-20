"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { controlDb } from "@/db/control";
import { memberships, ROLES, users, type Role, type User } from "@/db/control-schema";
import { audit } from "@/lib/audit";
import { hashPassword, requireContext, type Context } from "@/lib/auth";
import { oneOf, required, str } from "@/lib/forms";
import { accessGrantedMail, invitationMail, sendMail, type Mail } from "@/lib/mail";
import { createPasswordLink, isPendingInvite, PENDING_PASSWORD } from "@/lib/password-tokens";
import { can } from "@/lib/permissions";
import { tenantUrl } from "@/lib/tenant";

function assertCanAssign(actorRole: Role, target: Role) {
  if (target === "owner" && actorRole !== "owner") throw new Error("Само собственик може да дава роля „Собственик“.");
}

async function inviteMail(ctx: Context, user: User): Promise<Mail> {
  const base = { to: user.email, name: user.name, orgName: ctx.org.name, invitedBy: ctx.user.name };
  if (!isPendingInvite(user)) return accessGrantedMail({ ...base, url: tenantUrl(ctx.org.subdomain, "/login") });
  return invitationMail({ ...base, url: await createPasswordLink(user, "invite", ctx.org) });
}

/** Писмото не е критично: членството вече е създадено, а поканата може да се изпрати отново. */
async function trySend(mail: Mail) {
  try {
    await sendMail(mail);
  } catch (e) {
    console.error("[mail] invitation", e);
    throw new Error("Потребителят е добавен, но писмото не беше изпратено. Проверете SMTP настройките и натиснете „Изпрати поканата отново“.");
  }
}

/**
 * Нов акаунт без парола получава покана по имейл с линк за задаване на парола.
 * С въведена начална парола (резервен начин) писмо не се изпраща; съществуващ акаунт получава известие.
 */
export async function addMember(fd: FormData) {
  const ctx = await requireContext("manage");
  const email = required(str(fd, "email"), "Имейл").toLowerCase();
  const name = required(str(fd, "name"), "Име");
  const role = oneOf(fd, "role", ROLES, "staff");
  assertCanAssign(ctx.role, role);

  let [user] = await controlDb.select().from(users).where(eq(users.email, email)).limit(1);
  const isNew = !user;
  const password = str(fd, "password");
  if (!user) {
    if (password && password.length < 8) throw new Error("Началната парола трябва да е поне 8 знака (или оставете полето празно, за да изпратим покана).");
    const passwordHash = password ? hashPassword(password) : PENDING_PASSWORD;
    const [created] = await controlDb.insert(users).values({ email, name, passwordHash, canCreateOrganizations: false }).$returningId();
    [user] = await controlDb.select().from(users).where(eq(users.id, created.id));
  }
  const [existing] = await controlDb.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, ctx.org.id))).limit(1);
  if (existing) throw new Error("Този потребител вече е член на организацията.");
  await controlDb.insert(memberships).values({ userId: user.id, organizationId: ctx.org.id, role });
  await audit(ctx, "invite", "user", user.id, { email, role, method: isNew && password ? "password" : "email" });
  revalidatePath("/settings/users");
  if (!(isNew && password)) await trySend(await inviteMail(ctx, user));
}

/** Нов линк за покана (предишният се анулира). */
export async function resendInvite(membershipId: number) {
  const ctx = await requireContext("manage");
  const [row] = await controlDb
    .select({ user: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id)))
    .limit(1);
  if (!row) throw new Error("Членството не е намерено.");
  if (!isPendingInvite(row.user)) throw new Error("Потребителят вече е задал парола.");
  await trySend(await inviteMail(ctx, row.user));
  await audit(ctx, "invite", "user", row.user.id, { email: row.user.email, resend: true });
}

export async function changeRole(membershipId: number, fd: FormData) {
  const ctx = await requireContext("manage");
  const role = oneOf(fd, "role", ROLES, "staff");
  assertCanAssign(ctx.role, role);
  const [m] = await controlDb.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id))).limit(1);
  if (!m) throw new Error("Членството не е намерено.");
  if (m.role === "owner" && !can(ctx.role, "owner")) throw new Error("Само собственик може да променя друг собственик.");
  if (m.role === "owner" && role !== "owner") {
    const owners = await controlDb.select().from(memberships).where(and(eq(memberships.organizationId, ctx.org.id), eq(memberships.role, "owner")));
    if (owners.length <= 1) throw new Error("Организацията трябва да има поне един собственик.");
  }
  await controlDb.update(memberships).set({ role }).where(eq(memberships.id, membershipId));
  await audit(ctx, "role", "user", m.userId, { role });
  revalidatePath("/settings/users");
}

export async function removeMember(membershipId: number) {
  const ctx = await requireContext("manage");
  const [m] = await controlDb.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id))).limit(1);
  if (!m) throw new Error("Членството не е намерено.");
  if (m.userId === ctx.user.id) throw new Error("Не можете да премахнете себе си.");
  if (m.role === "owner") throw new Error("Първо сменете ролята на собственика.");
  await controlDb.delete(memberships).where(eq(memberships.id, membershipId));
  await audit(ctx, "remove_member", "user", m.userId);
  revalidatePath("/settings/users");
}

export async function changeOwnPassword(fd: FormData) {
  const ctx = await requireContext("read");
  const password = str(fd, "password");
  if (password.length < 8) throw new Error("Паролата трябва да е поне 8 знака.");
  await controlDb.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, ctx.user.id));
  revalidatePath("/settings");
}
