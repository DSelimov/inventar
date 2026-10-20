import { describe, expect, it } from "vitest";
import { detectDelimiter, mapHeader, parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("разпознава ; и ,", () => {
    expect(detectDelimiter("код;име;количество\n1;2;3")).toBe(";");
    expect(detectDelimiter("sku,name\na,b")).toBe(",");
    expect(parseCsv("код;име\nA1;Мишка")).toEqual([["код", "име"], ["A1", "Мишка"]]);
  });

  it("кавички, екранирани кавички, нов ред и разделител в поле", () => {
    const text = 'sku,name,description\nA1,"Мишка, безжична","Ред 1\nРед 2 ""цитат"""\n';
    expect(parseCsv(text)).toEqual([
      ["sku", "name", "description"],
      ["A1", "Мишка, безжична", 'Ред 1\nРед 2 "цитат"'],
    ]);
  });

  it("CRLF, BOM, празни редове и интервали", () => {
    expect(parseCsv("﻿sku;name\r\n\r\n  A1 ; Мишка \r\n;\r\n")).toEqual([["sku", "name"], ["A1", "Мишка"]]);
  });

  it("toCsv → parseCsv връща същите стойности", () => {
    const rows = [["код", "име"], ["A;1", 'Кабел "USB"'], ["B2", null]];
    expect(parseCsv(toCsv(rows))).toEqual([["код", "име"], ["A;1", 'Кабел "USB"'], ["B2", ""]]);
  });
});

describe("mapHeader", () => {
  it("български и английски заглавия, без значение на главни букви", () => {
    expect(mapHeader(["Код", "Наименование", "Количество", "Доставна цена", "EAN", "Склад"])).toEqual({
      sku: 0,
      name: 1,
      quantity: 2,
      unitCost: 3,
      barcode: 4,
      location: 5,
    });
  });

  it("първата съвпадаща колона печели, непознатите се игнорират", () => {
    expect(mapHeader(["sku", "code", "цвят", "price"])).toEqual({ sku: 0, unitPrice: 3 });
  });
});
