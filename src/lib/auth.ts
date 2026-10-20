import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { memberships, organizations, sessions, users, type Organization, type Role, type User } from "@/db/schema";
import { can, type Level } from "./permissions";

const COOKIE = "inv_session";
const SESSION_DAYS = 30;

export { hashPassword, verifyPassword, sha256 } from "./auth-crypto";
import { hashPassword as _h, sha256 } from "./auth-crypto";
void _h;

// ------------------------------------------------------------------ sessions
export async function createSession(userId: number, organizationId: number | null) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, organizationId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

export async function switchOrganization(organizationId: number) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return;
  await db.update(sessions).set({ organizationId }).where(eq(sessions.id, sha256(token)));
}

// ------------------------------------------------------------------- context
export type Context = {
  user: User;
  org: Organization;
  role: Role;
  memberships: Array<{ organizationId: number; role: Role; organization: Organization }>;
};

/** Current user + organization, or null when not logged in. Cached per request. */
export const getContext = cache(async (): Promise<Context | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sha256(token)) });
  if (!session || session.expiresAt < new Date()) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user) return null;
  const all = await db.query.memberships.findMany({
    where: eq(memberships.userId, user.id),
    with: { organization: true },
  });
  if (all.length === 0) return null;
  const active = all.find((m) => m.organizationId === session.organizationId) ?? all[0];
  return {
    user,
    org: active.organization,
    role: active.role,
    memberships: all.map((m) => ({ organizationId: m.organizationId, role: m.role, organization: m.organization })),
  };
});

/** Redirects to /login when not authenticated; throws when the role is too low. */
export async function requireContext(level: Level = "read"): Promise<Context> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, level)) throw new Error("Нямате права за това действие.");
  return ctx;
}

export async function findMembership(userId: number, organizationId: number) {
  return db.query.memberships.findFirst({
    where: and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)),
  });
}

export function slugify(name: string) {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya" };
  const base = name
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${randomBytes(2).toString("hex")}`;
}

export { organizations };
