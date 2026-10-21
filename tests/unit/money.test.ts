import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lineTotal, parseMoney, roundMoney, sumLines, sumMoney } from "@/lib/money";

describe("пари", () => {
  it("точни суми без грешки от плаваща запетая", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
    expect(sumMoney([1.0001, -0.0001])).toBe(1);
  });

  it("стойност на ред: закръгляне до стотинки, половинката далеч от нулата", () => {
    expect(lineTotal(3, 0.1)).toBe(0.3);
    expect(lineTotal(1, 1.005)).toBe(1.01);
    expect(lineTotal(1, 2.675)).toBe(2.68); // 2.675 * 100 като double е 267.49999…
    expect(lineTotal(-1, 2.675)).toBe(-2.68);
    expect(lineTotal(3, 1.3333)).toBe(4);
    expect(lineTotal(0.75, 12.4)).toBe(9.3);
    expect(lineTotal(1_000_000, 9_999_999.9999)).toBe(9_999_999_999_900);
  });

  it("сума на редове = сума на закръглените редове", () => {
    const rows = [{ q: 1, p: 0.005 }, { q: 1, p: 0.005 }, { q: 1, p: 0.005 }];
    expect(sumLines(rows, (r) => r.q, (r) => r.p)).toBe(0.03);
  });

  it("roundMoney", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(1.23456, 4)).toBe(1.2346);
  });

  it("parseMoney: запетая, интервали, празно, грешни стойности", () => {
    expect(parseMoney("1 234,50")).toBe(1234.5);
    expect(parseMoney("0,123456")).toBe(0.1235);
    expect(parseMoney("", "Цена", 7)).toBe(7);
    expect(parseMoney(undefined)).toBe(0);
    expect(parseMoney(12.3)).toBe(12.3);
    expect(() => parseMoney("abc")).toThrow("невалидна сума");
    expect(() => parseMoney("-1")).toThrow("отрицателна");
    expect(() => parseMoney("1e12")).toThrow("твърде голяма");
  });
});

/** Пазач: парите не се умножават/събират с обикновена аритметика извън src/lib/money.ts. */
describe("без float аритметика с пари в src/", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f) && !p.endsWith(path.join("lib", "money.ts")) && !p.endsWith(path.join("db", "seed.ts"))) files.push(p);
    }
  };
  walk(path.resolve("src"));
  // unitCost/unitPrice и всяка променлива, завършваща на price/cost (price, r.cost, originalUnitPrice…)
  const money = String.raw`[\w.?!]*(?:[pP]rice|[cC]ost)\b`;
  const pattern = new RegExp(String.raw`(\*\s*${money})|(\b${money}\s*\*)`);

  it("няма „количество * цена“ в JS", () => {
    const hits = files.flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((line, i) => ({ f, i: i + 1, line }))
        // SQL шаблоните (${…} * ${…}) смятат в MySQL върху decimal — точно
        .filter(({ line }) => pattern.test(line.replace(/\$\{[^}]*\}/g, "SQL"))),
    );
    expect(hits.map((h) => `${path.relative(process.cwd(), h.f)}:${h.i}`)).toEqual([]);
  });
});
