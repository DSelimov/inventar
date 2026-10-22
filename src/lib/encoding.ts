/**
 * Windows-1251 за файловете към българските счетоводни и складови програми (много от тях не четат UTF-8),
 * и разпознаване на кодировката на качен файл (UTF-8, иначе Windows-1251).
 */
const EXTRA: Record<string, number> = {
  "Ё": 0xa8, "ё": 0xb8, "№": 0xb9, "€": 0x88, "„": 0x84, "“": 0x93, "”": 0x94, "–": 0x96, "—": 0x97, "«": 0xab, "»": 0xbb,
  "Ѝ": 0xc8, "ѝ": 0xe8, // „Ѝ“ няма в 1251 — пише се като „И“
};

export function encodeCp1251(text: string) {
  const out = new Uint8Array(text.length * 2);
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out[n++] = c;
    else if (c >= 0x410 && c <= 0x44f) out[n++] = c - 0x410 + 0xc0;
    else if (EXTRA[ch] !== undefined) out[n++] = EXTRA[ch];
    else if (c === 0xa0) out[n++] = 0xa0;
    else out[n++] = 0x3f; // „?“ за знаците извън кодировката
  }
  return out.slice(0, n);
}

/** UTF-8 (с или без BOM), а ако не е валиден UTF-8 — Windows-1251. */
export function decodeText(bytes: ArrayBuffer | Uint8Array) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1251").decode(data);
  }
}
