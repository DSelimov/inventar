import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { controlDb } from "@/db/control";
import { organizations, passwordResets, users, type Organization, type User } from "@/db/control-schema";
import { sha256 } from "./auth-crypto";
import { rootUrl, tenantUrl } from "./tenant";

/** passwordHash на поканен потребител, който още не е задал парола. verifyPassword винаги връща false. */
export const PENDING_PASSWORD = "!invite";
export const isPendingInvite = (user: Pick<User, "passwordHash">) => user.passwordHash === PENDING_PASSWORD;

const TTL = { reset: 60 * 60_000, invite: 7 * 86_400_000 } as const;
type Purpose = keyof typeof TTL;

/**
 * Нов еднократен линк. Предишните неизползвани линкове със същата цел се анулират.
 * В базата се пази само sha256 на токена.
 */
export async function createPasswordLink(user: User, purpose: Purpose, org: Organization | null) {
  await controlDb.delete(passwordResets).where(and(eq(passwordResets.userId, user.id), eq(passwordResets.purpose, purpose), isNull(passwordResets.usedAt)));
  const token = randomBytes(32).toString("base64url");
  await controlDb.insert(passwordResets).values({
    id: sha256(token),
    userId: user.id,
    purpose,
    organizationId: org?.id ?? null,
    expiresAt: new Date(Date.now() + TTL[purpose]),
  });
  const path = `/reset-password?token=${token}`;
  return org ? tenantUrl(org.subdomain, path) : rootUrl(path);
}

/** Има ли неизползван линк за нова парола, създаден в последните `ms` милисекунди. */
export async function recentResetExists(userId: number, ms = 60_000) {
  const [row] = await controlDb
    .select({ id: passwordResets.id })
    .from(passwordResets)
    .where(and(eq(passwordResets.userId, userId), eq(passwordResets.purpose, "reset"), isNull(passwordResets.usedAt), gt(passwordResets.createdAt, new Date(Date.now() - ms))))
    .limit(1);
  return Boolean(row);
}

/** Валиден (неизползван и неизтекъл) линк или null. */
export async function findPasswordLink(token: string) {
  if (!token) return null;
  const [row] = await controlDb
    .select({ link: passwordResets, user: users, organization: organizations })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .leftJoin(organizations, eq(organizations.id, passwordResets.organizationId))
    .where(eq(passwordResets.id, sha256(token)))
    .limit(1);
  if (!row || row.link.usedAt || row.link.expiresAt < new Date()) return null;
  return row;
}
