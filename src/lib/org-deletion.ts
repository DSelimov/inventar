import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { controlDb } from "@/db/control";
import { databasePool, memberships, organizations, users, type Organization } from "@/db/control-schema";
import { dropTenantDatabase, getTenantDb } from "@/db/tenant";
import { deleteFiles } from "./storage";

/**
 * Окончателно изтриване на организация: базата (собствена — DROP DATABASE; от пула — таблиците, а базата
 * се връща в пула), снимките, организацията с членствата ѝ и потребителите без други организации
 * (освен администраторите на платформата). Извиква се от pnpm orgs:purge след гратисния период.
 */
export async function purgeOrganization(org: Organization) {
  const [pooled] = await controlDb.select().from(databasePool).where(eq(databasePool.assignedOrganizationId, org.id));
  if (pooled) {
    // предварително създадена база (режим manual): таблиците се трият, базата се връща в пула
    const db = getTenantDb(org);
    const [rows] = (await db.execute(sql`select table_name as t from information_schema.tables where table_schema = database()`)) as unknown as [Array<{ t: string }>];
    await db.execute(sql`set foreign_key_checks = 0`);
    for (const { t } of rows) await db.execute(sql.raw(`drop table if exists \`${t}\``));
    await db.execute(sql`set foreign_key_checks = 1`);
    await controlDb.update(databasePool).set({ assignedOrganizationId: null }).where(eq(databasePool.id, pooled.id));
  } else {
    await dropTenantDatabase(org.dbName);
  }
  await deleteFiles(org.dbName);
  const memberIds = (await controlDb.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.organizationId, org.id))).map((m) => m.userId);
  await controlDb.delete(organizations).where(eq(organizations.id, org.id)); // членствата се трият каскадно
  // потребители, които вече нямат организация (и не са администратори на платформата)
  if (memberIds.length) {
    const stillMember = (await controlDb.select({ userId: memberships.userId }).from(memberships)).map((m) => m.userId);
    for (const id of memberIds) {
      if (stillMember.includes(id)) continue;
      await controlDb.delete(users).where(and(eq(users.id, id), eq(users.isPlatformAdmin, false)));
    }
  }
}

