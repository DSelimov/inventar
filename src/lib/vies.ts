import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { viesChecks } from "@/db/tenant-schema";
import { log } from "./log";

/**
 * Проверка на ДДС номер във VIES (Европейската комисия, публичен REST API). Отговорите се кешират
 * в базата на клиента за MAX_AGE_DAYS; ако VIES не отговаря (често за отделни държави), се връща
 * valid = null и последният известен резултат, без да се блокира работата.
 */
const VIES_URL = process.env.VIES_URL || "https://ec.europa.eu/taxation_customs/vies/rest-api/ms";
const MAX_AGE_DAYS = 7;
const TIMEOUT_MS = 6000;

export type ViesResult = { valid: boolean | null; name: string | null; address: string | null; checkedAt: Date | null; fromCache: boolean; message: string };

const clean = (v: unknown) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s && s !== "---" ? s : null;
};

export async function checkVies(db: Db, vatNumber: string, o: { force?: boolean } = {}): Promise<ViesResult> {
  const vat = vatNumber.replace(/[\s.-]/g, "").toUpperCase();
  const country = vat.slice(0, 2) === "GR" ? "EL" : vat.slice(0, 2); // Гърция е EL във VIES
  const number = vat.slice(2);
  const [cached] = await db.select().from(viesChecks).where(eq(viesChecks.vatNumber, vat));
  if (cached && !o.force && Date.now() - cached.checkedAt.getTime() < MAX_AGE_DAYS * 86_400_000) {
    return { valid: cached.valid, name: cached.name, address: cached.address, checkedAt: cached.checkedAt, fromCache: true, message: cached.valid ? "Валиден ДДС номер (VIES)." : "Невалиден ДДС номер според VIES." };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${VIES_URL}/${encodeURIComponent(country)}/vat/${encodeURIComponent(number)}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
    const body = (await res.json()) as { isValid?: boolean; userError?: string; name?: string; address?: string };
    if (!res.ok || (body.userError && !["VALID", "INVALID"].includes(body.userError))) throw new Error(body.userError || `HTTP ${res.status}`);
    const valid = Boolean(body.isValid);
    const name = clean(body.name);
    const address = clean(body.address);
    const checkedAt = new Date();
    await db.insert(viesChecks).values({ vatNumber: vat, valid, name, address, checkedAt }).onDuplicateKeyUpdate({ set: { valid, name, address, checkedAt } });
    return { valid, name, address, checkedAt, fromCache: false, message: valid ? "Валиден ДДС номер (VIES)." : "Невалиден ДДС номер според VIES." };
  } catch (e) {
    log.warn("vies.unavailable", { vat, error: (e as Error).message });
    const last = cached ? ` Последна проверка: ${cached.valid ? "валиден" : "невалиден"}.` : "";
    return { valid: null, name: cached?.name ?? null, address: cached?.address ?? null, checkedAt: cached?.checkedAt ?? null, fromCache: Boolean(cached), message: `VIES не отговаря в момента — опитайте по-късно.${last}` };
  } finally {
    clearTimeout(timer);
  }
}
