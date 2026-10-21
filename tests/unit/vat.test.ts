import { describe, expect, it } from "vitest";
import { lineAmounts, netFromGross, vatSummary } from "@/lib/vat";

describe("ДДС на ред", () => {
  it("цени без ДДС: основа × ставка, до стотинка", () => {
    expect(lineAmounts(3, 9.99, 20)).toEqual({ net: 29.97, vat: 5.99, gross: 35.96 });
    expect(lineAmounts(1, 0.05, 9)).toEqual({ net: 0.05, vat: 0, gross: 0.05 });
    expect(lineAmounts(2.5, 4.2, 9)).toEqual({ net: 10.5, vat: 0.95, gross: 11.45 });
    expect(lineAmounts(10, 1.5, 0)).toEqual({ net: 15, vat: 0, gross: 15 });
  });

  it("цени с ДДС: основата се изважда от общото", () => {
    expect(lineAmounts(1, 12, 20, true)).toEqual({ net: 10, vat: 2, gross: 12 });
    expect(lineAmounts(3, 9.99, 20, true)).toEqual({ net: 24.98, vat: 4.99, gross: 29.97 }); // 24,975 → 24,98
    expect(netFromGross(1.09, 9)).toBe(1);
    expect(netFromGross(-12, 20)).toBe(-10);
  });

  it("обобщение по ставка", () => {
    const s = vatSummary([
      { vatRate: 20, netAmount: 10, vatAmount: 2, grossAmount: 12 },
      { vatRate: 9, netAmount: 100, vatAmount: 9, grossAmount: 109 },
      { vatRate: 20, netAmount: 0.1, vatAmount: 0.02, grossAmount: 0.12 },
    ]);
    expect(s.rows.map((r) => [r.rate, r.net, r.vat])).toEqual([
      [20, 10.1, 2.02],
      [9, 100, 9],
    ]);
    expect([s.net, s.vat, s.gross]).toEqual([110.1, 11.02, 121.12]);
  });
});
