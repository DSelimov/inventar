import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type AppSettings = {
  lowStockAlerts: boolean;
  /** Analysis window for turnover and usage (days). */
  windowDays: number;
  /** No outbound movement for this many days = dead stock. */
  deadStockDays: number;
  /** Default supplier lead time when the partner has none. */
  leadTimeDays: number;
  /** Extra days of cover to keep as safety stock. */
  safetyDays: number;
  /** Target gross margin in percent, highlighted in reports. */
  targetMarginPct: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  lowStockAlerts: true,
  windowDays: 30,
  deadStockDays: 90,
  leadTimeDays: 7,
  safetyDays: 7,
  targetMarginPct: 30,
};

export async function getSettings(organizationId: number): Promise<AppSettings> {
  const rows = await db.select().from(settings).where(eq(settings.organizationId, organizationId));
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const num = (key: keyof AppSettings) => {
    const v = Number(map[key]);
    return Number.isFinite(v) && v > 0 ? v : (DEFAULT_SETTINGS[key] as number);
  };
  return {
    lowStockAlerts: (map.lowStockAlerts ?? String(DEFAULT_SETTINGS.lowStockAlerts)) === "true",
    windowDays: num("windowDays"),
    deadStockDays: num("deadStockDays"),
    leadTimeDays: num("leadTimeDays"),
    safetyDays: num("safetyDays"),
    targetMarginPct: num("targetMarginPct"),
  };
}

export async function setSetting(organizationId: number, key: string, value: string) {
  await db
    .insert(settings)
    .values({ organizationId, key, value })
    .onConflictDoUpdate({ target: [settings.organizationId, settings.key], set: { value } });
}
