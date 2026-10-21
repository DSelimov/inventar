import { describe, expect, it } from "vitest";
import { readTaxFields, validEik } from "@/lib/tax-ids";

describe("ЕИК и ДДС номер", () => {
  it("регистрирано българско лице без ДДС номер получава BG + ЕИК", () => {
    expect(readTaxFields({ eik: "123 456 786", vatRegistered: true })).toEqual({ eik: "123456786", vatNumber: "BG123456786", vatRegistered: true, country: "BG" });
  });

  it("ДДС номер ⇒ регистриран; чуждестранен номер се приема", () => {
    expect(readTaxFields({ vatNumber: "ro 1234567", country: "ro" })).toEqual({ eik: null, vatNumber: "RO1234567", vatRegistered: true, country: "RO" });
    expect(readTaxFields({ eik: "", vatNumber: "" })).toEqual({ eik: null, vatNumber: null, vatRegistered: false, country: "BG" });
  });

  it("грешни формати и несъвпадение", () => {
    expect(() => readTaxFields({ eik: "12345" })).toThrow("ЕИК");
    expect(() => readTaxFields({ vatNumber: "123456789" })).toThrow("кода на държавата");
    expect(() => readTaxFields({ vatNumber: "BG12345" })).toThrow("BG + ЕИК");
    expect(() => readTaxFields({ eik: "123456786", vatNumber: "BG987654322" })).toThrow("не съвпада с ЕИК");
  });

  it("контролна цифра: ЕИК от 9 и 13 цифри, ЕГН", () => {
    for (const ok of ["123456786", "205123457", "831012340", "1234567860001", "7501011232"]) expect(validEik(ok)).toBe(true);
    for (const bad of ["123456789", "205123450", "1234567860002", "7501011230"]) expect(validEik(bad)).toBe(false);
    expect(() => readTaxFields({ eik: "123456789" })).toThrow("контролната цифра");
    expect(() => readTaxFields({ vatNumber: "BG123456789" })).toThrow("контролната цифра");
  });
});
