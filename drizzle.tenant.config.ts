import { defineConfig } from "drizzle-kit";

/** Схема на една клиентска база. Миграциите се прилагат към всяка база от src/db/migrate.ts. */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/tenant-schema.ts",
  out: "./drizzle/tenant",
  dbCredentials: { url: process.env.TENANT_TEMPLATE_DATABASE_URL ?? "mysql://root:root@localhost:3307/inv__template" },
});
