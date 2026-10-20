import "server-only";
import { eq } from "drizzle-orm";
import { controlDb } from "@/db/control";
import { memberships, users } from "@/db/control-schema";

/** Членове на организация (контролна база). */
export async function listMembers(organizationId: number) {
  return controlDb
    .select({ id: memberships.id, userId: memberships.userId, role: memberships.role, createdAt: memberships.createdAt, user: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(memberships.createdAt);
}
