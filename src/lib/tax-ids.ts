import { UserError } from "./errors";

/**
 * ЕИК / ДДС номер: нормализиране, проверка на формата и на контролната цифра (БУЛСТАТ/ЕГН).
 * Дали ДДС номерът е активен — VIES (src/lib/vies.ts).
 * ЕИК: 9 цифри (юридически лица) или 13 (клонове); 10 цифри — ЕГН/ЛНЧ на физически лица.
 * ДДС номер: код на държавата (2 букви, за Гърция EL) + 2–13 знака; за България — BG + ЕИК/ЕГН.
 */

const digits = (v: string) => [...v].map(Number);
const weighted = (d: number[], w: number[]) => d.reduce((s, x, i) => s + x * w[i], 0);

/** Контролна цифра на 9-цифрен ЕИК: тегла 1–8, при остатък 10 — тегла 3–10, при пак 10 — 0. */
function eik9Check(d: number[]) {
  let r = weighted(d, [1, 2, 3, 4, 5, 6, 7, 8]) % 11;
  if (r === 10) r = weighted(d, [3, 4, 5, 6, 7, 8, 9, 10]) % 11;
  return r === 10 ? 0 : r;
}

/** ЕИК от 9 или 13 цифри (БУЛСТАТ на клон) или ЕГН от 10 цифри — с проверка на контролната цифра. */
export function validEik(v: string) {
  if (!/^(\d{9}|\d{10}|\d{13})$/.test(v)) return false;
  const d = digits(v);
  if (v.length === 10) return (weighted(d.slice(0, 9), [2, 4, 8, 5, 10, 9, 7, 3, 6]) % 11) % 10 === d[9];
  if (eik9Check(d.slice(0, 8)) !== d[8]) return false;
  if (v.length === 9) return true;
  let r = weighted(d.slice(8, 12), [2, 7, 3, 5]) % 11;
  if (r === 10) r = weighted(d.slice(8, 12), [4, 9, 5, 7]) % 11;
  return (r === 10 ? 0 : r) === d[12];
}

export function normalizeEik(raw: string | null | undefined) {
  const v = (raw ?? "").replace(/\s/g, "");
  if (!v) return null;
  if (!/^(\d{9}|\d{10}|\d{13})$/.test(v)) throw new UserError("ЕИК трябва да е 9 или 13 цифри (10 за ЕГН).");
  if (!validEik(v)) throw new UserError(`ЕИК ${v} е невалиден — контролната цифра не съвпада.`);
  return v;
}

export function normalizeVatNumber(raw: string | null | undefined) {
  const v = (raw ?? "").replace(/[\s.-]/g, "").toUpperCase();
  if (!v) return null;
  if (!/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(v)) throw new UserError("ДДС номерът започва с кода на държавата, напр. BG123456789.");
  if (v.startsWith("BG") && !/^BG(\d{9}|\d{10}|\d{13})$/.test(v)) throw new UserError("Българският ДДС номер е BG + ЕИК (9 или 13 цифри) или ЕГН.");
  if (v.startsWith("BG") && !validEik(v.slice(2))) throw new UserError(`ДДС номер ${v} е невалиден — контролната цифра не съвпада.`);
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
