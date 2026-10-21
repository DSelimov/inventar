"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { controlDb } from "@/db/control";
import { memberships, ROLES, users, type Role, type User } from "@/db/control-schema";
import { audit } from "@/lib/audit";
import { destroyAllSessions, destroyOtherSessions, hashPassword, requireContext, verifyPassword, type Context } from "@/lib/auth";
import { oneOf, required, str } from "@/lib/forms";
import { accessGrantedMail, invitationMail, sendMail, type Mail } from "@/lib/mail";
import { createPasswordLink, isPendingInvite, PENDING_PASSWORD } from "@/lib/password-tokens";
import { can } from "@/lib/permissions";
import { rootUrl, tenantUrl } from "@/lib/tenant";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { log } from "@/lib/log";

function assertCanAssign(actorRole: Role, target: Role) {
  if (target === "owner" && actorRole !== "owner") throw new UserError("Само собственик може да дава роля „Собственик“.");
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
    log.error("mail.invitation_failed", e, { to: mail.to });
    throw new UserError("Потребителят е добавен, но писмото не беше изпратено. Проверете SMTP настройките и натиснете „Изпрати поканата отново“.");
  }
}

/**
 * Нов акаунт без парола получава покана по имейл с линк за задаване на парола.
 * С въведена начална парола (резервен начин) писмо не се изпраща; съществуващ акаунт получава известие.
 */
export const addMember = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const email = required(str(fd, "email"), "Имейл").toLowerCase();
  const name = required(str(fd, "name"), "Име");
  const role = oneOf(fd, "role", ROLES, "staff");
  assertCanAssign(ctx.role, role);

  let [user] = await controlDb.select().from(users).where(eq(users.email, email)).limit(1);
  const isNew = !user;
  const password = str(fd, "password");
  if (!user) {
    if (password && password.length < 8) throw new UserError("Началната парола трябва да е поне 8 знака (или оставете полето празно, за да изпратим покана).");
    const passwordHash = password ? hashPassword(password) : PENDING_PASSWORD;
    const [created] = await controlDb.insert(users).values({ email, name, passwordHash, canCreateOrganizations: false }).$returningId();
    [user] = await controlDb.select().from(users).where(eq(users.id, created.id));
  }
  const [existing] = await controlDb.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, ctx.org.id))).limit(1);
  if (existing) throw new UserError("Този потребител вече е член на организацията.");
  await controlDb.insert(memberships).values({ userId: user.id, organizationId: ctx.org.id, role });
  await audit(ctx, "invite", "user", user.id, { email, role, method: isNew && password ? "password" : "email" });
  revalidatePath("/settings/users");
  if (!(isNew && password)) await trySend(await inviteMail(ctx, user));
  return "Потребителят е добавен.";
});

/** Нов линк за покана (предишният се анулира). */
export const resendInvite = act(async (membershipId: number) => {
  const ctx = await requireContext("manage");
  const [row] = await controlDb
    .select({ user: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id)))
    .limit(1);
  if (!row) throw new UserError("Членството не е намерено.");
  if (!isPendingInvite(row.user)) throw new UserError("Потребителят вече е задал парола.");
  await trySend(await inviteMail(ctx, row.user));
  await audit(ctx, "invite", "user", row.user.id, { email: row.user.email, resend: true });
  return "Поканата е изпратена отново.";
});

export const changeRole = act(async (membershipId: number, fd: FormData) => {
  const ctx = await requireContext("manage");
  const role = oneOf(fd, "role", ROLES, "staff");
  assertCanAssign(ctx.role, role);
  const [m] = await controlDb.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id))).limit(1);
  if (!m) throw new UserError("Членството не е намерено.");
  if (m.role === "owner" && !can(ctx.role, "owner")) throw new UserError("Само собственик може да променя друг собственик.");
  if (m.role === "owner" && role !== "owner") {
    const owners = await controlDb.select().from(memberships).where(and(eq(memberships.organizationId, ctx.org.id), eq(memberships.role, "owner")));
    if (owners.length <= 1) throw new UserError("Организацията трябва да има поне един собственик.");
  }
  await controlDb.update(memberships).set({ role }).where(eq(memberships.id, membershipId));
  await audit(ctx, "role", "user", m.userId, { role });
  revalidatePath("/settings/users");
  return "Ролята е сменена.";
});

export const removeMember = act(async (membershipId: number) => {
  const ctx = await requireContext("manage");
  const [m] = await controlDb.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id))).limit(1);
  if (!m) throw new UserError("Членството не е намерено.");
  if (m.userId === ctx.user.id) throw new UserError("Не можете да премахнете себе си.");
  if (m.role === "owner") throw new UserError("Първо сменете ролята на собственика.");
  await controlDb.delete(memberships).where(eq(memberships.id, membershipId));
  await audit(ctx, "remove_member", "user", m.userId);
  revalidatePath("/settings/users");
  return "Потребителят е премахнат.";
});

export const changeOwnPassword = act(async (fd: FormData) => {
  const ctx = await requireContext("read");
  if (!verifyPassword(str(fd, "currentPassword"), ctx.user.passwordHash)) throw new UserError("Текущата парола е грешна.");
  const password = str(fd, "password");
  if (password.length < 8) throw new UserError("Паролата трябва да е поне 8 знака.");
  await controlDb.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, ctx.user.id));
  await destroyOtherSessions(ctx.user.id);
  revalidatePath("/settings");
  return "Паролата е сменена. Излязохте от всички други устройства.";
});

export const logoutEverywhere = act(async () => {
  const ctx = await requireContext("read");
  await destroyAllSessions(ctx.user.id);
  redirect(rootUrl("/login"));
});

/** Дневен имейл с известия за текущата организация (мениджър и нагоре). */
export const setEmailDigest = act(async (fd: FormData) => {
  const ctx = await requireContext("delete");
  const on = fd.get("emailDigest") === "on";
  await controlDb.update(memberships).set({ emailDigest: on }).where(and(eq(memberships.userId, ctx.user.id), eq(memberships.organizationId, ctx.org.id)));
  revalidatePath("/settings");
  return on ? "Ще получавате дневен имейл с известия." : "Дневният имейл е изключен.";
});
