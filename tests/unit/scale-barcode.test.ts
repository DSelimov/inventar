import { describe, expect, it } from "vitest";
import { divideToQuantity } from "@/lib/quantity";
import { DEFAULT_SCALE_FORMATS, eanCheckDigit, parseScaleBarcode, pluCandidates, readScaleFormats } from "@/lib/scale-barcode";

const ean = (first12: string) => first12 + eanCheckDigit(first12);

describe("баркодове от везни", () => {
  it("контролна цифра EAN-13", () => {
    expect(eanCheckDigit("400638133393")).toBe(1); // 4006381333931
    expect(ean("280012301250")).toMatch(/^\d{13}$/);
  });

  it("тегло и цена по стандартните формати; грешна контролна цифра и чужд префикс", () => {
    const w = parseScaleBarcode(ean("280012301250"), DEFAULT_SCALE_FORMATS);
    expect(w).toMatchObject({ plu: "00123", kind: "weight", value: 1.25 });
    const p = parseScaleBarcode(ean("290045600999"), DEFAULT_SCALE_FORMATS);
    expect(p).toMatchObject({ plu: "00456", kind: "price", value: 9.99 });
    const good = ean("280012301250");
    const bad = good.slice(0, 12) + ((Number(good[12]) + 1) % 10);
    expect(parseScaleBarcode(bad, DEFAULT_SCALE_FORMATS)).toBeNull();
    expect(parseScaleBarcode("4006381333931", DEFAULT_SCALE_FORMATS)).toBeNull(); // валиден EAN, но не от везна
    expect(parseScaleBarcode("12345", DEFAULT_SCALE_FORMATS)).toBeNull();
  });

  it("PLU без водещи нули, количество от цена, валидиране на форматите", () => {
    expect(pluCandidates("00123")).toEqual(["00123", "123"]);
    expect(divideToQuantity(9.99, 12.49, 3)).toBe(0.8);
    expect(divideToQuantity(1.25, 1, 3)).toBe(1.25);
    expect(readScaleFormats('[{"prefix":"28","pluLength":5,"kind":"weight"},{"prefix":"x","pluLength":5,"kind":"weight"}]')).toEqual([{ prefix: "28", pluLength: 5, kind: "weight" }]);
    expect(readScaleFormats("not json")).toEqual([]);
  });
});
