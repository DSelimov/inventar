import type { Db } from "@/db/tenant";
import { settings } from "@/db/tenant-schema";

export type AppSettings = {
  lowStockAlerts: boolean;
  /** Цените в поръчките се въвеждат с ДДС (иначе — без ДДС). */
  pricesIncludeVat: boolean;
  windowDays: number;
  deadStockDays: number;
  leadTimeDays: number;
  safetyDays: number;
  targetMarginPct: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  lowStockAlerts: true,
  pricesIncludeVat: false,
  windowDays: 30,
  deadStockDays: 90,
  leadTimeDays: 7,
  safetyDays: 7,
  targetMarginPct: 30,
};

export async function getSettings(db: Db): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const num = (key: keyof AppSettings) => {
    const v = Number(map[key]);
    return Number.isFinite(v) && v > 0 ? v : (DEFAULT_SETTINGS[key] as number);
  };
  return {
    lowStockAlerts: (map.lowStockAlerts ?? String(DEFAULT_SETTINGS.lowStockAlerts)) === "true",
    pricesIncludeVat: map.pricesIncludeVat === "true",
    windowDays: num("windowDays"),
    deadStockDays: num("deadStockDays"),
    leadTimeDays: num("leadTimeDays"),
    safetyDays: num("safetyDays"),
    targetMarginPct: num("targetMarginPct"),
  };
}

export async function setSetting(db: Db, key: string, value: string) {
  await db.insert(settings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

/** Данни на фирмата за документите (стокова разписка, справки). */
export type CompanyDetails = { legalName: string; eik: string; vatNumber: string; address: string; phone: string; mol: string; bank: string; iban: string };
export const COMPANY_FIELDS = ["legalName", "eik", "vatNumber", "address", "phone", "mol", "bank", "iban"] as const;

export async function getCompanyDetails(db: Db): Promise<CompanyDetails> {
  const rows = await db.select().from(settings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(COMPANY_FIELDS.map((k) => [k, map[`company.${k}`] ?? ""])) as CompanyDetails;
}
