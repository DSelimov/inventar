import { describe, expect, it } from "vitest";
import { applyPercent } from "@/lib/money";
import { effectivePriceGroup, parsePercent, roundPrice, salesPrice } from "@/lib/pricing";

describe("ценообразуване", () => {
  it("процент без грешки от плаваща запетая", () => {
    expect(applyPercent(10, 20)).toBe(12);
    expect(applyPercent(0.1, 200)).toBe(0.3);
    expect(applyPercent(19.99, -15)).toBe(16.9915);
    expect(applyPercent(1.1, 10)).toBe(1.21);
    expect(applyPercent(5, -100)).toBe(0);
  });

  it("закръгляне на цени", () => {
    expect(roundPrice(16.9915)).toBe(16.99);
    expect(roundPrice(12.345, "0.10")).toBe(12.3);
    expect(roundPrice(12.36, "0.50")).toBe(12.5);
    expect(roundPrice(12.5, "1")).toBe(13);
    expect(roundPrice(10.2, "0.99")).toBe(10.99);
    expect(roundPrice(10, "0.99")).toBe(9.99);
    expect(roundPrice(0.2, "0.99")).toBe(0.99);
  });

  it("група на партньора преди групата на локацията; отстъпка върху цената от групата", () => {
    expect(effectivePriceGroup(2, 5)).toBe(2);
    expect(effectivePriceGroup(null, 5)).toBe(5);
    expect(effectivePriceGroup(null, null)).toBeNull();
    expect(salesPrice({ retail: 24.9 })).toBe(24.9);
    expect(salesPrice({ retail: 24.9, groupPrice: 19.5 })).toBe(19.5);
    expect(salesPrice({ retail: 24.9, groupPrice: null, discountPercent: 10 })).toBe(22.41);
    expect(salesPrice({ retail: 24.9, groupPrice: 19.5, discountPercent: 5 })).toBe(18.53); // 18.525 → 18.53
    expect(salesPrice({ retail: 1.2345 })).toBe(1.2345); // без отстъпка — точно
  });

  it("процент от формата", () => {
    expect(parsePercent("5,5", "Отстъпка", { min: 0, max: 100 })).toBe(5.5);
    expect(parsePercent("", "Отстъпка")).toBe(0);
    expect(() => parsePercent("150", "Отстъпка", { min: 0, max: 100 })).toThrow();
    expect(() => parsePercent("abc")).toThrow();
  });
});
