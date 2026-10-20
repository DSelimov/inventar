/* Прилага миграциите: контролна база + всички клиентски бази.  pnpm db:migrate */
import { migrate } from "drizzle-orm/mysql2/migrator";
import path from "node:path";
import { controlDb } from "./control";
import { organizations } from "./control-schema";
import { getTenantDb, migrateTenantDb } from "./tenant";

async function main() {
  await migrate(controlDb, { migrationsFolder: path.join(process.cwd(), "drizzle", "control") });
  console.log("Контролна база: ок");
  const orgs = await controlDb.select().from(organizations);
  for (const org of orgs) {
    if (org.status === "failed") continue;
    try {
      await migrateTenantDb(getTenantDb(org));
      console.log(`  ${org.subdomain} (${org.dbName}): ок`);
    } catch (e) {
      console.error(`  ${org.subdomain} (${org.dbName}): ГРЕШКА`, e instanceof Error ? e.message : e);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
