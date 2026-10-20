"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { locations, memberships, organizations, users } from "@/db/schema";
import { createSession, destroySession, findMembership, getContext, hashPassword, slugify, switchOrganization, verifyPassword } from "@/lib/auth";
import { str } from "@/lib/forms";

export async function login(_prev: string | undefined, fd: FormData): Promise<string | undefined> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !verifyPassword(password, user.passwordHash)) return "Грешен имейл или парола.";
  const membership = await db.query.memberships.findFirst({ where: eq(memberships.userId, user.id) });
  await createSession(user.id, membership?.organizationId ?? null);
  redirect("/");
}

export async function register(_prev: string | undefined, fd: FormData): Promise<string | undefined> {
  const orgName = str(fd, "organization");
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!orgName || !name || !email) return "Попълнете всички полета.";
  if (password.length < 8) return "Паролата трябва да е поне 8 знака.";
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return "Вече има акаунт с този имейл. Влезте и създайте организацията от менюто.";

  const orgId = await db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: orgName, slug: slugify(orgName) }).returning();
    const [user] = await tx.insert(users).values({ email, name, passwordHash: hashPassword(password) }).returning();
    await tx.insert(memberships).values({ userId: user.id, organizationId: org.id, role: "owner" });
    await tx.insert(locations).values({ organizationId: org.id, name: "Основен склад", code: "MAIN", isDefault: true });
    await createSession(user.id, org.id);
    return org.id;
  });
  void orgId;
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function switchOrg(organizationId: number) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const m = await findMembership(ctx.user.id, organizationId);
  if (!m) throw new Error("Нямате достъп до тази организация.");
  await switchOrganization(organizationId);
  redirect("/");
}

/** Logged-in user creates an additional organization and becomes its owner. */
export async function createOrganization(fd: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const name = str(fd, "name");
  if (!name) throw new Error("Въведете име на организацията.");
  const orgId = await db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name, slug: slugify(name) }).returning();
    await tx.insert(memberships).values({ userId: ctx.user.id, organizationId: org.id, role: "owner" });
    await tx.insert(locations).values({ organizationId: org.id, name: "Основен склад", code: "MAIN", isDefault: true });
    return org.id;
  });
  await switchOrganization(orgId);
  redirect("/");
}
