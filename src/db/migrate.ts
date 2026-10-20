/* Прилага миграциите: контролна база + всички клиентски бази.  pnpm db:migrate */
import { migrateAll } from "./migrations";

migrateAll()
  .then((r) => {
    console.log("Контролна база: ок");
    for (const t of r.tenants) console.log(`  ${t.subdomain} (${t.dbName}): ${t.ok ? "ок" : `ГРЕШКА ${t.error}`}`);
    process.exit(r.tenants.some((t) => !t.ok) ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
