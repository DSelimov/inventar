/*
 * Превалутиране от лева в евро (1 EUR = 1.95583 BGN) на всички организации с валута BGN.
 *   pnpm db:euro [--dry-run] [поддомейн…]
 * Безопасно за повторно изпускане: вече превалутираните се пропускат. Направете архив преди това (pnpm db:backup).
 */
import { eq, inArray } from "drizzle-orm";
import { convertTenantToEuro } from "@/lib/euro";
import { controlDb } from "./control";
import { organizations } from "./control-schema";
import { closeTenantPools } from "./tenant";

const dryRun = process.argv.includes("--dry-run");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

async function main() {
  const orgs = await controlDb
    .select()
    .from(organizations)
    .where(only.length ? inArray(organizations.subdomain, only) : eq(organizations.currency, "BGN"));
  if (!orgs.length) console.log("Няма организации с валута BGN.");
  let failed = 0;
  for (const org of orgs) {
    try {
      const r = await convertTenantToEuro(org, { id: null, name: "Превалутиране (pnpm db:euro)" }, { dryRun });
      const what = { converted: dryRun ? "ще бъде превалутирана" : "превалутирана", already: "вече е в евро", "not-bgn": `валута ${org.currency}, пропусната` }[r.status];
      console.log(`  ${org.subdomain}: ${what}${r.status === "converted" ? ` — ${r.items} артикула, ${r.orderLines} реда в ${r.orders} поръчки` : ""}`);
    } catch (e) {
      failed++;
      console.error(`  ${org.subdomain}: ГРЕШКА ${(e as Error).message}`);
    }
  }
  await closeTenantPools();
  await controlDb.$client.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
