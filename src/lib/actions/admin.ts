"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import mysql from "mysql2/promise";
import { controlDb } from "@/db/control";
import { databasePool, organizations, plans, SUBSCRIPTION_STATUSES } from "@/db/control-schema";
import { addDatabaseToPool, getTenantDb, provisionTenant } from "@/db/tenant";
import { locations } from "@/db/tenant-schema";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { int, required, str } from "@/lib/forms";
import { log } from "@/lib/log";
import { roundMoney } from "@/lib/money";
import { assertPlatformAdmin } from "@/lib/platform";

async function findOrg(id: number) {
  const [org] = await controlDb.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) throw new UserError("Организацията не е намерена.");
  return org;
}

export const suspendOrganization = act(async (id: number) => {
  const admin = await assertPlatformAdmin();
  const org = await findOrg(id);
  if (org.status !== "active") throw new UserError("Може да се спре само активна организация.");
  await controlDb.update(organizations).set({ status: "suspended" }).where(eq(organizations.id, id));
  log.info("admin.org_suspended", { by: admin.user.email, org: org.subdomain });
  revalidatePath("/admin");
  return `„${org.name}“ е спряна. Потребителите и API ключовете ѝ нямат достъп.`;
});

export const activateOrganization = act(async (id: number) => {
  const admin = await assertPlatformAdmin();
  const org = await findOrg(id);
  if (org.status !== "suspended") throw new UserError("Може да се активира само спряна организация.");
  await controlDb.update(organizations).set({ status: "active" }).where(eq(organizations.id, id));
  log.info("admin.org_activated", { by: admin.user.email, org: org.subdomain });
  revalidatePath("/admin");
  return `„${org.name}“ е активна отново.`;
});

/** Нов опит за създаване и миграция на базата (след грешка или заседнала подготовка). */
export const retryProvisioning = act(async (id: number) => {
  const admin = await assertPlatformAdmin();
  const org = await findOrg(id);
  if (org.status !== "failed" && org.status !== "provisioning") throw new UserError("Организацията вече е подготвена.");
  try {
    const active = await provisionTenant(org);
    const db = getTenantDb(active);
    const existing = await db.select({ id: locations.id }).from(locations).limit(1);
    if (!existing.length) await db.insert(locations).values({ name: "Основен склад", code: "MAIN", isDefault: true });
  } catch (e) {
    log.error("admin.provisioning_failed", e, { by: admin.user.email, org: org.subdomain });
    revalidatePath("/admin");
    throw new UserError(`Подготовката отново не успя: ${e instanceof Error ? e.message : String(e)}`);
  }
  log.info("admin.org_provisioned", { by: admin.user.email, org: org.subdomain });
  revalidatePath("/admin");
  return `Базата на „${org.name}“ е готова.`;
});

/** Добавя готова база в пула (режим manual). Проверява връзката преди да я запише. */
export const addPoolDatabase = act(async (fd: FormData) => {
  const admin = await assertPlatformAdmin();
  const dbName = required(str(fd, "dbName"), "База");
  const dbUser = required(str(fd, "dbUser"), "Потребител");
  const dbPassword = str(fd, "dbPassword");
  const dbHost = str(fd, "dbHost") || "localhost";
  const dbPort = int(fd, "dbPort", 3306) || 3306;
  if (!/^[A-Za-z0-9_$-]{1,64}$/.test(dbName)) throw new UserError("Невалидно име на база.");
  const [dup] = await controlDb.select({ id: databasePool.id }).from(databasePool).where(eq(databasePool.dbName, dbName)).limit(1);
  if (dup) throw new UserError(`Базата „${dbName}“ вече е в пула.`);
  try {
    const conn = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPassword, database: dbName, connectTimeout: 5000 });
    await conn.end();
  } catch (e) {
    throw new UserError(`Няма връзка с базата: ${(e as { code?: string }).code ?? (e instanceof Error ? e.message : String(e))}`);
  }
  await addDatabaseToPool({ dbName, dbUser, dbPassword, dbHost, dbPort });
  log.info("admin.pool_added", { by: admin.user.email, dbName, dbHost });
  revalidatePath("/admin/pool");
  return `Базата „${dbName}“ е добавена в пула.`;
});

export const removePoolDatabase = act(async (id: number) => {
  const admin = await assertPlatformAdmin();
  const [res] = await controlDb.delete(databasePool).where(and(eq(databasePool.id, id), isNull(databasePool.assignedOrganizationId)));
  if (res.affectedRows !== 1) throw new UserError("Само свободна база може да се премахне от пула.");
  log.info("admin.pool_removed", { by: admin.user.email, id });
  revalidatePath("/admin/pool");
  return "Базата е премахната от пула.";
});

// ----------------------------------------------------------------- абонаменти
const optLimit = (fd: FormData, key: string) => {
  const v = str(fd, key);
  if (!v) return null; // празно = без лимит
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new UserError("Лимитът е цяло неотрицателно число или празно (без лимит).");
  return n;
};

export const updatePlan = act(async (id: number, fd: FormData) => {
  const admin = await assertPlatformAdmin();
  const price = Number(str(fd, "monthlyPrice").replace(",", "."));
  if (!Number.isFinite(price) || price < 0) throw new UserError("Невалидна цена.");
  await controlDb
    .update(plans)
    .set({
      name: required(str(fd, "name"), "Име"),
      monthlyPrice: roundMoney(price),
      maxUsers: optLimit(fd, "maxUsers"),
      maxItems: optLimit(fd, "maxItems"),
      maxLocations: optLimit(fd, "maxLocations"),
      maxInvoicesPerMonth: optLimit(fd, "maxInvoicesPerMonth"),
      apiAccess: str(fd, "apiAccess") === "on",
      integrations: str(fd, "integrations") === "on",
      active: str(fd, "active") === "on",
      description: str(fd, "description") || null,
    })
    .where(eq(plans.id, id));
  log.info("admin.plan_updated", { by: admin.user.email, plan: id });
  revalidatePath("/admin/plans");
  return "Планът е запазен.";
});

/** Ръчно управление на абонамента (докато няма онлайн плащане). */
export const setSubscription = act(async (orgId: number, fd: FormData) => {
  const admin = await assertPlatformAdmin();
  const org = await findOrg(orgId);
  const status = SUBSCRIPTION_STATUSES.find((s) => s === str(fd, "status"));
  if (!status) throw new UserError("Невалиден статус.");
  const date = (key: string) => {
    const v = str(fd, key);
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new UserError("Невалидна дата.");
    return new Date(`${v}T23:59:59Z`);
  };
  const planId = int(fd, "planId", 0) || null;
  await controlDb.update(organizations).set({ planId, subscriptionStatus: status, trialEndsAt: date("trialEndsAt"), paidUntil: date("paidUntil") }).where(eq(organizations.id, orgId));
  log.info("admin.subscription_changed", { by: admin.user.email, org: org.subdomain, planId, status });
  revalidatePath("/admin");
  return `Абонаментът на „${org.name}“ е обновен.`;
});
