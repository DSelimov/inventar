import { defineConfig } from "drizzle-kit";

/** Контролна база (организации, потребители). За клиентските бази: drizzle.tenant.config.ts */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/control-schema.ts",
  out: "./drizzle/control",
  dbCredentials: { url: process.env.CONTROL_DATABASE_URL ?? "mysql://root:root@localhost:3307/inventory_control" },
});
