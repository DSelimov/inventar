/*
 * Статусите на товарителниците за всички активни организации с включен куриер: доставените пратки се
 * приключват (изписване от склада), върнатите — отказват.
 *   pnpm carriers:sync
 * Cron (на всеки час):  0 * * * * cd /home/<user>/inventar && pnpm carriers:sync >> carriers.log 2>&1
 */
import { eq } from "drizzle-orm";
import { syncCarrierStatuses } from "@/lib/integrations/waybills";
import { subscriptionState } from "@/lib/plans";
import { controlDb } from "./control";
import { organizations } from "./control-schema";
import { closeTenantPools, getTenantDb } from "./tenant";

async function main() {
  for (const org of await controlDb.select().from(organizations).where(eq(organizations.status, "active"))) {
    if (subscriptionState(org).readOnly) continue;
    try {
      const r = await syncCarrierStatuses(getTenantDb(org), { id: 0, name: "Куриер (автоматично)" });
      if (r.checked || r.errors.length) console.log(`  ${org.subdomain}: проверени ${r.checked}, доставени ${r.delivered}, върнати ${r.returned}${r.errors.length ? `, грешки: ${r.errors.join("; ")}` : ""}`);
    } catch (e) {
      console.error(`  ${org.subdomain}: ГРЕШКА ${(e as Error).message}`);
    }
  }
  await closeTenantPools();
  await controlDb.$client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
