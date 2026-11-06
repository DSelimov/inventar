/**
 * Баркодове от везни (EAN-13 с вътрешен префикс 20–29): ПП + PLU + стойност + контролна цифра.
 * Стойността е тегло (в грамове → кг с 3 знака), цена (в стотинки) или брой — според формата.
 * Без достъп до базата: ползва се и в мобилния режим в браузъра.
 */

export const SCALE_KINDS = ["weight", "price", "count"] as const;
export type ScaleKind = (typeof SCALE_KINDS)[number];
export const SCALE_KIND_LABELS: Record<ScaleKind, string> = { weight: "тегло (кг, 3 знака)", price: "цена (2 знака)", count: "брой" };

export type ScaleFormat = { prefix: string; pluLength: number; kind: ScaleKind };

/** Обичайни формати на везните в България (Elicom, CAS, DIBAL…): 28/29 + 5 цифри PLU + 5 цифри стойност. */
export const DEFAULT_SCALE_FORMATS: ScaleFormat[] = [
  { prefix: "28", pluLength: 5, kind: "weight" },
  { prefix: "29", pluLength: 5, kind: "price" },
];

/** Контролна цифра на EAN-13 от първите 12 цифри. */
export function eanCheckDigit(first12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export type ScaleReading = { plu: string; kind: ScaleKind; value: number; format: ScaleFormat };

/** Разчита баркод от везна; null, ако не е такъв (грешна контролна цифра, друг префикс). */
export function parseScaleBarcode(code: string, formats: ScaleFormat[]): ScaleReading | null {
  const c = code.trim();
  if (!/^\d{13}$/.test(c)) return null;
  if (eanCheckDigit(c.slice(0, 12)) !== Number(c[12])) return null;
  for (const f of formats) {
    if (!c.startsWith(f.prefix)) continue;
    const start = f.prefix.length;
    const plu = c.slice(start, start + f.pluLength);
    const raw = c.slice(start + f.pluLength, 12);
    if (!raw) continue;
    const n = Number(raw);
    const value = f.kind === "weight" ? n / 1000 : f.kind === "price" ? n / 100 : n;
    // PLU без водещите нули също се намира (00123 = 123)
    return { plu, kind: f.kind, value, format: f };
  }
  return null;
}

/** Варианти на PLU за търсене: както е и без водещи нули. */
export function pluCandidates(plu: string) {
  const trimmed = plu.replace(/^0+(?=\d)/, "");
  return [...new Set([plu, trimmed])];
}

/** Валидира форматите от настройките (JSON). */
export function readScaleFormats(raw: string | null | undefined): ScaleFormat[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as ScaleFormat[];
    return list.filter((f) => /^\d{1,3}$/.test(f.prefix) && f.pluLength >= 3 && f.pluLength <= 7 && f.prefix.length + f.pluLength <= 10 && SCALE_KINDS.includes(f.kind));
  } catch {
    return [];
  }
}
