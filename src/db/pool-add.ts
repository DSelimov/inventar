/* Добавя предварително създадена база в пула (TENANT_DB_MODE=manual).
   pnpm db:pool:add <база> <потребител> <парола> [host] [port] */
import { addDatabaseToPool } from "./tenant";

const [dbName, dbUser, dbPassword, dbHost, dbPort] = process.argv.slice(2);
if (!dbName || !dbUser || !dbPassword) {
  console.error("Употреба: pnpm db:pool:add <база> <потребител> <парола> [host] [port]");
  process.exit(1);
}
addDatabaseToPool({ dbName, dbUser, dbPassword, dbHost, dbPort: dbPort ? Number(dbPort) : undefined })
  .then(() => {
    console.log(`Базата ${dbName} е добавена в пула.`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
