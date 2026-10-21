import { describe, expect, it } from "vitest";
import { readTaxFields } from "@/lib/tax-ids";

describe("ЕИК и ДДС номер", () => {
  it("регистрирано българско лице без ДДС номер получава BG + ЕИК", () => {
    expect(readTaxFields({ eik: "123 456 789", vatRegistered: true })).toEqual({ eik: "123456789", vatNumber: "BG123456789", vatRegistered: true, country: "BG" });
  });

  it("ДДС номер ⇒ регистриран; чуждестранен номер се приема", () => {
    expect(readTaxFields({ vatNumber: "ro 1234567", country: "ro" })).toEqual({ eik: null, vatNumber: "RO1234567", vatRegistered: true, country: "RO" });
    expect(readTaxFields({ eik: "", vatNumber: "" })).toEqual({ eik: null, vatNumber: null, vatRegistered: false, country: "BG" });
  });

  it("грешни формати и несъвпадение", () => {
    expect(() => readTaxFields({ eik: "12345" })).toThrow("ЕИК");
    expect(() => readTaxFields({ vatNumber: "123456789" })).toThrow("кода на държавата");
    expect(() => readTaxFields({ vatNumber: "BG12345" })).toThrow("BG + ЕИК");
    expect(() => readTaxFields({ eik: "123456789", vatNumber: "BG987654321" })).toThrow("не съвпада");
  });
});
