/** Minimal CSV helpers usable on server and client. Auto-detects `,` or `;`. */

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > semis && tabs > commas) return "\t";
  return semis > commas ? ";" : ",";
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>, delimiter = ";"): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r,\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(delimiter)).join("\r\n");
}

/**
 * Column aliases accepted in an items import (lowercase, trimmed). Includes the headers of a goods list
 * exported to Excel/CSV from Microinvest Склад Pro (Код, Име, Баркод1, Мярка, Група, Доставна цена, Цена
 * на дребно), so clients switching from it can import without renaming columns.
 */
export const ITEM_IMPORT_COLUMNS: Record<string, string[]> = {
  sku: ["sku", "код", "артикул №", "артикулен номер", "code", "код на стока", "каталожен номер"],
  name: ["name", "име", "наименование", "артикул", "стока", "име на стока"],
  barcode: ["barcode", "баркод", "ean", "баркод1", "баркод 1"],
  category: ["category", "категория", "група", "стокова група"],
  quantity: ["quantity", "количество", "наличност", "qty", "к-во"],
  minQuantity: ["min", "minimum", "минимум", "минимално количество", "min_quantity", "мин. количество"],
  unit: ["unit", "мерна единица", "м.е.", "мярка", "мярка 1"],
  unitCost: ["cost", "unit_cost", "доставна цена", "себестойност", "цена доставна", "доставна"],
  unitPrice: ["price", "unit_price", "продажна цена", "цена", "цена на дребно", "цена дребно", "продажна"],
  location: ["location", "локация", "склад"],
  description: ["description", "описание"],
};

/** Column aliases for a partners import, incl. Microinvest (Фирма, Булстат, Данъчен номер, МОЛ, Град). */
export const PARTNER_IMPORT_COLUMNS: Record<string, string[]> = {
  name: ["name", "име", "фирма", "наименование", "партньор", "контрагент", "клиент", "доставчик"],
  eik: ["eik", "еик", "булстат", "еик/булстат", "идентификационен номер", "егн"],
  vatNumber: ["vat", "vat_number", "ддс №", "ддс номер", "ин по ддс", "данъчен номер", "идент. № по ддс"],
  contactName: ["contact", "мол", "лице за контакт", "контакт", "представител"],
  email: ["email", "e-mail", "имейл", "ел. поща"],
  phone: ["phone", "телефон", "тел.", "gsm", "мобилен"],
  city: ["city", "град", "населено място"],
  address: ["address", "адрес"],
  type: ["type", "тип", "вид"],
  notes: ["notes", "бележка", "бележки", "забележка"],
};

export function mapHeader(header: string[], columns: Record<string, string[]> = ITEM_IMPORT_COLUMNS): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(columns)) {
      if (aliases.includes(key) && map[field] === undefined) map[field] = i;
    }
  });
  return map;
}
