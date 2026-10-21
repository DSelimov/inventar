import "server-only";
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { controlDb } from "@/db/control";
import { memberships, plans, type Organization, type Plan } from "@/db/control-schema";
import type { Db } from "@/db/tenant";
import { invoices, items, locations } from "@/db/tenant-schema";
import { startOfLocalDay, localTodayIso } from "./dates";
import { UserError } from "./errors";

/**
 * Абонаментни планове и лимити. Докато няма онлайн плащане, статусът и „платено до“ се водят ръчно в /admin.
 *  - trial: пълен достъп до края на пробния период, после — само преглед;
 *  - active: пълен достъп; ако paidUntil е минал — GRACE_DAYS гратисен период, после само преглед;
 *  - past_due: GRACE_DAYS от paidUntil (или веднага, ако няма дата), после само преглед;
 *  - cancelled: само преглед. Данните никога не се трият заради абонамента.
 */
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;
const DAY = 86_400_000;

export type LimitKey = "users" | "items" | "locations" | "invoices";
export const LIMIT_LABELS: Record<LimitKey, string> = { users: "потребители", items: "артикули", locations: "локации", invoices: "фактури за месеца" };

export async function listPlans(activeOnly = true) {
  return controlDb.select().from(plans).where(activeOnly ? eq(plans.active, true) : undefined).orderBy(asc(plans.sortOrder));
}

export async function planOf(org: Pick<Organization, "planId">): Promise<Plan | null> {
  if (!org.planId) return null;
  const [p] = await controlDb.select().from(plans).where(eq(plans.id, org.planId));
  return p ?? null;
}

export type SubscriptionState = { readOnly: boolean; message: string | null; trialDaysLeft: number | null; warning: string | null };

export function subscriptionState(org: Pick<Organization, "subscriptionStatus" | "trialEndsAt" | "paidUntil">, now = Date.now()): SubscriptionState {
  const days = (d: Date) => Math.ceil((d.getTime() - now) / DAY);
  switch (org.subscriptionStatus) {
    case "trial": {
      if (!org.trialEndsAt) return { readOnly: false, message: null, trialDaysLeft: null, warning: null };
      const left = days(org.trialEndsAt);
      if (left <= 0) return { readOnly: true, message: "Пробният период изтече — данните са достъпни само за преглед. Свържете се с нас за абонамент.", trialDaysLeft: 0, warning: null };
      return { readOnly: false, message: null, trialDaysLeft: left, warning: left <= 3 ? `Пробният период изтича след ${left} ${left === 1 ? "ден" : "дни"}.` : null };
    }
    case "active":
    case "past_due": {
      const until = org.paidUntil;
      if (org.subscriptionStatus === "active" && (!until || until.getTime() > now)) return { readOnly: false, message: null, trialDaysLeft: null, warning: null };
      const graceEnd = until ? until.getTime() + GRACE_DAYS * DAY : now;
      if (graceEnd > now) return { readOnly: false, message: null, trialDaysLeft: null, warning: `Абонаментът не е платен — достъпът става само за преглед след ${Math.ceil((graceEnd - now) / DAY)} дни.` };
      return { readOnly: true, message: "Абонаментът не е платен — данните са достъпни само за преглед.", trialDaysLeft: null, warning: null };
    }
    case "cancelled":
      return { readOnly: true, message: "Абонаментът е прекратен — данните са достъпни само за преглед и експорт.", trialDaysLeft: null, warning: null };
  }
}

/** Текущото използване спрямо лимитите на плана. */
export async function usage(org: Pick<Organization, "id">, db: Db) {
  const monthStart = startOfLocalDay(`${localTodayIso().slice(0, 7)}-01`);
  const [[users], [itemCount], [locationCount], [invoiceCount]] = await Promise.all([
    controlDb.select({ n: count() }).from(memberships).where(eq(memberships.organizationId, org.id)),
    db.select({ n: count() }).from(items),
    db.select({ n: count() }).from(locations).where(eq(locations.active, true)),
    db.select({ n: count() }).from(invoices).where(and(inArray(invoices.status, ["issued", "cancelled"]), inArray(invoices.kind, ["invoice", "credit_note", "debit_note"]), gte(invoices.issuedAt, monthStart))),
  ]);
  return { users: users.n, items: itemCount.n, locations: locationCount.n, invoices: invoiceCount.n } satisfies Record<LimitKey, number>;
}

const limitOf = (plan: Plan, key: LimitKey) => ({ users: plan.maxUsers, items: plan.maxItems, locations: plan.maxLocations, invoices: plan.maxInvoicesPerMonth })[key];

/** Отказва, ако добавянето на `adding` бройки надхвърля лимита на плана. Без план — без лимит. */
export async function assertWithinLimit(ctx: { org: Organization; db: Db }, key: LimitKey, adding = 1) {
  const plan = await planOf(ctx.org);
  const limit = plan ? limitOf(plan, key) : null;
  if (limit === null || limit === undefined) return;
  const used = (await usage(ctx.org, ctx.db))[key];
  if (used + adding > limit) throw new UserError(`Планът „${plan!.name}“ позволява до ${limit} ${LIMIT_LABELS[key]} (сега ${used}). За по-голям план вижте Настройки › Абонамент.`);
}

export const PLAN_CONTACT = process.env.PLATFORM_CONTACT_EMAIL || "sales@example.bg";
