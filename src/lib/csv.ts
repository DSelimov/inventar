/** Minimal CSV helpers usable on server and client. Auto-detects `,` or `;`. */

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
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
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(delimiter)).join("\r\n");
}

/** Column aliases accepted in an items import (lowercase, trimmed). */
export const ITEM_IMPORT_COLUMNS: Record<string, string[]> = {
  sku: ["sku", "код", "артикул №", "артикулен номер", "code"],
  name: ["name", "име", "наименование", "артикул"],
  barcode: ["barcode", "баркод", "ean"],
  category: ["category", "категория"],
  quantity: ["quantity", "количество", "наличност", "qty"],
  minQuantity: ["min", "minimum", "минимум", "минимално количество", "min_quantity"],
  unit: ["unit", "мерна единица", "м.е."],
  unitCost: ["cost", "unit_cost", "доставна цена", "себестойност"],
  unitPrice: ["price", "unit_price", "продажна цена", "цена"],
  location: ["location", "локация", "склад"],
  description: ["description", "описание"],
};

export function mapHeader(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(ITEM_IMPORT_COLUMNS)) {
      if (aliases.includes(key) && map[field] === undefined) map[field] = i;
    }
  });
  return map;
}
