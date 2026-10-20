import { db } from "@/db";
import { settings } from "@/db/schema";

export type AppSettings = {
  companyName: string;
  currency: string;
  lowStockAlerts: boolean;
};

const DEFAULTS: AppSettings = {
  companyName: "Моята фирма",
  currency: "EUR",
  lowStockAlerts: true,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    companyName: map.companyName ?? DEFAULTS.companyName,
    currency: map.currency ?? DEFAULTS.currency,
    lowStockAlerts: (map.lowStockAlerts ?? String(DEFAULTS.lowStockAlerts)) === "true",
  };
}
