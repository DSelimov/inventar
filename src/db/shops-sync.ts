// Онлайн магазините за всички активни организации с включен WooCommerce/Shopify: нови поръчки → продажби,
// после наличността (само променената).
//   pnpm shops:sync
// Cron (на 5 минути): */5 * * * * cd /home/<user>/inventar && pnpm shops:sync >> shops.log 2>&1
import { eq } from "drizzle-orm";
import { syncShops } from "@/lib/integrations/shops/sync";
import { subscriptionState } from "@/lib/plans";
import { controlDb } from "./control";
import { organizations } from "./control-schema";
import { closeTenantPools, getTenantDb } from "./tenant";

async function main() {
  for (const org of await controlDb.select().from(organizations).where(eq(organizations.status, "active"))) {
    if (subscriptionState(org).readOnly) continue;
    try {
      for (const r of await syncShops(getTenantDb(org), { id: 0, name: "Магазин (автоматично)" }, { currency: org.currency })) {
        console.log(`  ${org.subdomain} · ${r.provider}: наличност ${r.pushed}, поръчки ${r.created.length}${r.errors.length ? `, грешки: ${r.errors.join("; ")}` : ""}`);
      }
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
