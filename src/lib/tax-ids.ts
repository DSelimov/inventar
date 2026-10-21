import { UserError } from "./errors";

/**
 * ЕИК / ДДС номер: нормализиране и проверка на формата. Контролната сума и VIES са в B2.
 * ЕИК: 9 цифри (юридически лица) или 13 (клонове); 10 цифри — ЕГН/ЛНЧ на физически лица.
 * ДДС номер: код на държавата (2 букви, за Гърция EL) + 2–13 знака; за България — BG + ЕИК/ЕГН.
 */

export function normalizeEik(raw: string | null | undefined) {
  const v = (raw ?? "").replace(/\s/g, "");
  if (!v) return null;
  if (!/^(\d{9}|\d{10}|\d{13})$/.test(v)) throw new UserError("ЕИК трябва да е 9 или 13 цифри (10 за ЕГН).");
  return v;
}

export function normalizeVatNumber(raw: string | null | undefined) {
  const v = (raw ?? "").replace(/[\s.-]/g, "").toUpperCase();
  if (!v) return null;
  if (!/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(v)) throw new UserError("ДДС номерът започва с кода на държавата, напр. BG123456789.");
  if (v.startsWith("BG") && !/^BG(\d{9}|\d{10}|\d{13})$/.test(v)) throw new UserError("Българският ДДС номер е BG + ЕИК (9 или 13 цифри) или ЕГН.");
  return v;
}

export function normalizeCountry(raw: string | null | undefined) {
  const v = (raw ?? "").trim().toUpperCase() || "BG";
  if (!/^[A-Z]{2}$/.test(v)) throw new UserError("Държавата е двубуквен код, напр. BG, RO, DE.");
  return v;
}

/** Държавите от ЕС (за 0 % при вътреобщностна доставка и обратно начисляване). */
export const EU_COUNTRIES = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"] as const;

/** Данъчните полета на партньор от форма/API: ЕИК, ДДС №, регистрация, държава — съгласувани помежду си. */
export function readTaxFields(input: { eik?: unknown; vatNumber?: unknown; vatRegistered?: unknown; country?: unknown }) {
  const country = normalizeCountry(input.country as string);
  const eik = normalizeEik(input.eik as string);
  let vatNumber = normalizeVatNumber(input.vatNumber as string);
  const vatRegistered = Boolean(input.vatRegistered) || Boolean(vatNumber);
  // регистрирано българско лице без въведен ДДС номер: BG + ЕИК
  if (vatRegistered && !vatNumber && eik && country === "BG") vatNumber = `BG${eik}`;
  if (vatNumber?.startsWith("BG") && eik && vatNumber !== `BG${eik}`) throw new UserError("ДДС номерът не съвпада с ЕИК (трябва BG + ЕИК).");
  return { eik, vatNumber, vatRegistered, country };
}
