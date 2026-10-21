/*
 * Окончателно изтриване на организации, заявено от собственика преди повече от DELETION_GRACE_DAYS дни:
 * базата (или таблиците ѝ, ако е от пула), снимките, членствата, потребителите без други организации.
 *   pnpm orgs:purge [--dry-run] [--now <поддомейн>]
 * Cron (всеки ден в 03:30):  30 3 * * * cd /home/<user>/inventar && pnpm orgs:purge >> purge.log 2>&1
 */
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { DELETION_GRACE_DAYS } from "@/lib/legal";
import { purgeOrganization } from "@/lib/org-deletion";
import { controlDb } from "./control";
import { organizations } from "./control-schema";
import { closeTenantPools } from "./tenant";

const dryRun = process.argv.includes("--dry-run");
const nowIdx = process.argv.indexOf("--now");
const immediate = nowIdx > 0 ? process.argv[nowIdx + 1] : null;

async function main() {
  const cutoff = new Date(Date.now() - DELETION_GRACE_DAYS * 86_400_000);
  const orgs = await controlDb
    .select()
    .from(organizations)
    .where(immediate ? and(eq(organizations.subdomain, immediate), isNotNull(organizations.deletionRequestedAt)) : and(isNotNull(organizations.deletionRequestedAt), lt(organizations.deletionRequestedAt, cutoff)));
  if (!orgs.length) console.log(immediate ? `Няма заявено изтриване за „${immediate}“.` : "Няма организации за изтриване.");
  for (const org of orgs) {
    console.log(`  ${org.subdomain} (${org.dbName}), заявено ${org.deletionRequestedAt?.toISOString()} от ${org.deletionRequestedBy}${dryRun ? " — dry-run" : ""}`);
    if (!dryRun) await purgeOrganization(org);
  }
  await closeTenantPools();
  await controlDb.$client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
