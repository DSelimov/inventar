import { describe, expect, it } from "vitest";
import { mapHeader, parseCsv, PARTNER_IMPORT_COLUMNS } from "@/lib/csv";
import { decodeText, encodeCp1251 } from "@/lib/encoding";

describe("Windows-1251", () => {
  it("кодира кирилица, „№“ и „€“ по таблицата на 1251; непознатите знаци стават „?“", () => {
    expect([...encodeCp1251("АБя№€a")]).toEqual([0xc0, 0xc1, 0xff, 0xb9, 0x88, 0x61]);
    expect([...encodeCp1251("ЁёЍ😀")]).toEqual([0xa8, 0xb8, 0xc8, 0x3f]);
  });

  it("разпознава UTF-8 (и маха BOM), иначе чете Windows-1251", () => {
    expect(decodeText(new TextEncoder().encode("﻿Код;Име"))).toBe("Код;Име");
    expect(decodeText(encodeCp1251("Код;Име;Цена на дребно"))).toBe("Код;Име;Цена на дребно");
  });

  it("CSV от Microinvest (1251, табулация): заглавията се разпознават", () => {
    const text = decodeText(encodeCp1251("Код\tИме\tБаркод1\tМярка\tГрупа\tДоставна цена\tЦена на дребно\r\n101\tКафе\t380\tкг\tНапитки\t10,5\t15\r\n"));
    const t = parseCsv(text);
    expect(t[1]).toEqual(["101", "Кафе", "380", "кг", "Напитки", "10,5", "15"]);
    expect(mapHeader(t[0])).toEqual({ sku: 0, name: 1, barcode: 2, unit: 3, category: 4, unitCost: 5, unitPrice: 6 });
    expect(mapHeader(["Фирма", "Булстат", "Данъчен номер", "МОЛ", "Град", "Адрес"], PARTNER_IMPORT_COLUMNS)).toEqual({ name: 0, eik: 1, vatNumber: 2, contactName: 3, city: 4, address: 5 });
  });
});
