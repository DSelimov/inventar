import { describe, expect, it } from "vitest";
import { addQty, decimalsOf, itemDecimals, parseQuantity, quantityStep, subQty, sumQty } from "@/lib/quantity";

describe("количества", () => {
  it("точно събиране и изваждане на хилядни", () => {
    expect(addQty(0.1, 0.2)).toBe(0.3);
    expect(subQty(1, 0.9)).toBe(0.1);
    expect(sumQty([{ q: 0.333 }, { q: 0.333 }, { q: 0.334 }], (r) => r.q)).toBe(1);
  });

  it("decimalsOf", () => {
    expect(decimalsOf(12)).toBe(0);
    expect(decimalsOf(12.5)).toBe(1);
    expect(decimalsOf(0.75)).toBe(2);
    expect(decimalsOf(0.0005)).toBe(4);
    expect(decimalsOf(1e-7)).toBe(7);
  });

  it("parseQuantity според знаците на артикула", () => {
    expect(parseQuantity("12,5", 1)).toBe(12.5);
    expect(parseQuantity("1 000", 0)).toBe(1000);
    expect(parseQuantity("", 0, "К-во", 1)).toBe(1);
    expect(parseQuantity("12,500", 1)).toBe(12.5); // нулите в края не са знаци
    expect(() => parseQuantity("1.5", 0)).toThrow("въведете цяло число");
    expect(() => parseQuantity("0.125", 2)).toThrow("най-много 2 знака");
    expect(() => parseQuantity("-1", 3)).toThrow("отрицателно");
    expect(() => parseQuantity("abc", 3)).toThrow("невалидно");
  });

  it("серийните номера са винаги цели; стъпка за полетата", () => {
    expect(itemDecimals({ tracking: "serial", quantityDecimals: 3 })).toBe(0);
    expect(itemDecimals({ tracking: "lot", quantityDecimals: 2 })).toBe(2);
    expect(quantityStep(0)).toBe("1");
    expect(quantityStep(3)).toBe("0.001");
  });
});
