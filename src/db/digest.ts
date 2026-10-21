/*
 * Дневен имейл с известия (ниска наличност, закъснели пратки, изтичащи/изтекли партиди) до мениджърите,
 * администраторите и собствениците на всяка активна организация, които не са го изключили.
 *   pnpm notify:digest [--dry-run] [--force]
 * Без известия писмо не се изпраща; на един потребител — най-много веднъж на ден (--force го пренебрегва).
 * Cron (всеки ден в 07:30):  30 7 * * * cd /home/<user>/inventar && pnpm notify:digest >> digest.log 2>&1
 */
import { and, eq, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { alertCounts, listAlerts } from "@/lib/alerts";
import { digestMail, sendMail } from "@/lib/mail";
import { tenantUrl } from "@/lib/tenant";
import { controlDb } from "./control";
import { memberships, organizations, users } from "./control-schema";
import { closeTenantPools, getTenantDb } from "./tenant";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

async function main() {
  const today = format(new Date(), "yyyy-MM-dd");
  let sent = 0;
  for (const org of await controlDb.select().from(organizations).where(eq(organizations.status, "active"))) {
    const db = getTenantDb(org);
    const counts = await alertCounts(db, today);
    if (!counts.total) continue;
    const a = await listAlerts(db, today, 5); // примери в писмото
    const recipients = await controlDb
      .select({ membershipId: memberships.id, sentOn: memberships.digestSentOn, email: users.email, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, org.id), eq(memberships.emailDigest, true), inArray(memberships.role, ["owner", "admin", "manager"])));
    const name = (i: { name: string; variantLabel: string | null }) => (i.variantLabel ? `${i.name} · ${i.variantLabel}` : i.name);
    const sections = [
      { title: "Ниска наличност", count: counts.lowStock, examples: a.lowStock.map((i) => `${name(i)} (${i.quantity}/${i.minQuantity})`) },
      { title: "Закъснели пратки", count: counts.overdue, examples: a.overdue.map((s) => `${s.reference} от ${s.expectedDate}`) },
      { title: "Просрочени фактури", count: counts.overdueInvoices, examples: a.overdueInvoices.map((i) => `№ ${i.number} · ${i.recipientName ?? ""} · падеж ${i.dueDate}`) },
      { title: "Изтекли партиди", count: counts.expired, examples: a.expired.map((l) => `${l.item.name} ${l.lotNumber}`) },
      { title: "Изтичащи до 30 дни", count: counts.expiring, examples: a.expiring.map((l) => `${l.item.name} ${l.lotNumber} (${l.expiryDate})`) },
    ];
    for (const r of recipients) {
      if (!force && r.sentOn === today) continue;
      const mail = digestMail({ to: r.email, name: r.name, orgName: org.name, url: tenantUrl(org.subdomain, "/notifications"), sections });
      if (dryRun) {
        console.log(`[dry-run] ${org.subdomain} → ${r.email}: ${mail.subject}`);
        continue;
      }
      try {
        await sendMail(mail);
        await controlDb.update(memberships).set({ digestSentOn: today }).where(eq(memberships.id, r.membershipId));
        sent++;
        console.log(`${org.subdomain} → ${r.email}: изпратено`);
      } catch (e) {
        console.error(`${org.subdomain} → ${r.email}: ГРЕШКА ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`Изпратени писма: ${sent}${dryRun ? " (dry-run)" : ""}`);
  await closeTenantPools();
  await controlDb.$client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
