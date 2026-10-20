"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { controlDb } from "@/db/control";
import { memberships, organizations, passwordResets, sessions, users } from "@/db/control-schema";
import { getTenantDb, provisionTenant, tenantDbName } from "@/db/tenant";
import { locations } from "@/db/tenant-schema";
import { createSession, destroySession, getSession, hashPassword, suggestSubdomain, verifyPassword } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { str } from "@/lib/forms";
import { passwordResetMail, sendMail } from "@/lib/mail";
import { createPasswordLink, findPasswordLink, recentResetExists } from "@/lib/password-tokens";
import { currentTenant, isValidSubdomain, rootUrl, tenantUrl } from "@/lib/tenant";

export async function login(_prev: string | undefined, fd: FormData): Promise<string | undefined> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const [user] = await controlDb.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) return "Грешен имейл или парола.";

  const tenant = await currentTenant();
  if (tenant) {
    const [m] = await controlDb.select().from(memberships).where(eq(memberships.userId, user.id));
    const member = (await controlDb.select().from(memberships).where(eq(memberships.userId, user.id))).find((x) => x.organizationId === tenant.id);
    void m;
    if (!member) return `Нямате достъп до организация „${tenant.name}“. Помолете администратора ѝ да ви добави.`;
    await createSession(user.id, tenant.id);
    redirect("/");
  }
  await createSession(user.id, null);
  redirect("/portal");
}

/** Нова организация: създава база, прилага миграциите, прави потребителя собственик. */
async function createOrganizationFor(userId: number, name: string, subdomainInput: string) {
  const subdomain = (subdomainInput || suggestSubdomain(name)).toLowerCase();
  if (!isValidSubdomain(subdomain)) throw new UserError("Поддомейнът може да съдържа само малки латински букви, цифри и тире (3–63 знака) и да не е запазена дума.");
  const [taken] = await controlDb.select({ id: organizations.id }).from(organizations).where(eq(organizations.subdomain, subdomain)).limit(1);
  if (taken) throw new UserError(`Поддомейнът „${subdomain}“ вече е зает.`);

  const [{ id }] = await controlDb.insert(organizations).values({ name, subdomain, dbName: tenantDbName(subdomain) }).$returningId();
  await controlDb.insert(memberships).values({ userId, organizationId: id, role: "owner" });
  const [org] = await controlDb.select().from(organizations).where(eq(organizations.id, id));
  const active = await provisionTenant(org);
  await getTenantDb(active).insert(locations).values({ name: "Основен склад", code: "MAIN", isDefault: true });
  return active;
}

export async function register(_prev: string | undefined, fd: FormData): Promise<string | undefined> {
  const orgName = str(fd, "organization");
  const subdomain = str(fd, "subdomain");
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!orgName || !name || !email) return "Попълнете всички полета.";
  if (password.length < 8) return "Паролата трябва да е поне 8 знака.";
  const [existing] = await controlDb.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return "Вече има акаунт с този имейл. Влезте и създайте организацията от портала.";

  let org;
  try {
    const [{ id: userId }] = await controlDb.insert(users).values({ email, name, passwordHash: hashPassword(password) }).$returningId();
    org = await createOrganizationFor(userId, orgName, subdomain);
    await createSession(userId, org.id);
  } catch (e) {
    if (e instanceof UserError) return e.message;
    console.error("[register] create organization", e);
    return "Грешка при създаване на организацията. Опитайте отново.";
  }
  redirect(tenantUrl(org.subdomain));
}

/** От портала: влязъл потребител създава още една организация. */
export async function createOrganization(_prev: string | undefined, fd: FormData): Promise<string | undefined> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.canCreateOrganizations) return "Нямате право да създавате организации.";
  const name = str(fd, "name");
  if (!name) return "Въведете име на организацията.";
  let org;
  try {
    org = await createOrganizationFor(session.user.id, name, str(fd, "subdomain"));
  } catch (e) {
    if (e instanceof UserError) return e.message;
    console.error("[register] create organization", e);
    return "Грешка при създаване на организацията. Опитайте отново.";
  }
  redirect(tenantUrl(org.subdomain));
}

/** Забравена парола: изпраща линк, ако има такъв акаунт. Отговорът е еднакъв и без акаунт. */
export async function requestPasswordReset(_prev: string | undefined, fd: FormData): Promise<string | undefined> {
  const email = str(fd, "email").toLowerCase();
  if (!email) return "Въведете имейл.";
  const tenant = await currentTenant();
  const [user] = await controlDb.select().from(users).where(eq(users.email, email)).limit(1);
  if (user && !(await recentResetExists(user.id))) {
    const member = tenant && (await controlDb.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, tenant.id))).limit(1)).length > 0;
    const org = member ? tenant : null;
    const url = await createPasswordLink(user, "reset", org);
    try {
      await sendMail(passwordResetMail({ to: user.email, name: user.name, url, orgName: org?.name }));
    } catch (e) {
      console.error("[mail] password reset", e);
      return "Писмото не можа да бъде изпратено. Опитайте отново по-късно.";
    }
  }
  redirect("/forgot-password?sent=1");
}

/** Нова парола по линк (забравена парола или покана). Прекратява всички сесии на потребителя. */
export async function resetPassword(_prev: string | undefined, fd: FormData): Promise<string | undefined> {
  const password = str(fd, "password");
  if (password.length < 8) return "Паролата трябва да е поне 8 знака.";
  if (password !== str(fd, "confirm")) return "Паролите не съвпадат.";
  const found = await findPasswordLink(str(fd, "token"));
  if (!found) return "Линкът е невалиден или е изтекъл. Заявете нов.";
  const { link, user, organization } = found;

  // Еднократен: маркира се като използван само ако още не е бил (паралелни заявки).
  const [res] = await controlDb.update(passwordResets).set({ usedAt: new Date() }).where(and(eq(passwordResets.id, link.id), isNull(passwordResets.usedAt)));
  if (res.affectedRows !== 1) return "Линкът вече е използван.";
  await controlDb.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, user.id));
  await controlDb.delete(sessions).where(eq(sessions.userId, user.id));
  await controlDb.delete(passwordResets).where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));

  const tenant = await currentTenant();
  const org = tenant && organization?.id === tenant.id ? tenant : null;
  await createSession(user.id, org?.id ?? null);
  redirect(org ? "/" : "/portal");
}

export async function logout() {
  await destroySession();
  redirect(rootUrl("/login"));
}
