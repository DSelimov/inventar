import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { fetchEcbRates, toBase } from "@/lib/fx";
import { convertMoney } from "@/lib/money";

const XML = `<?xml version="1.0"?><gesmes:Envelope><Cube><Cube time='2026-11-05'>
<Cube currency='USD' rate='1.0850'/><Cube currency='GBP' rate='0.8400'/><Cube currency='RON' rate='4.9750'/></Cube></Cube></gesmes:Envelope>`;
const fakeFetch = (async () => new Response(XML, { status: 200 })) as unknown as typeof fetch;

describe("валути", () => {
  it("преобразуване по курс — точно", () => {
    expect(convertMoney(100, 0.92165899)).toBe(92.1659);
    expect(convertMoney(19.99, 1.95583, 2)).toBe(39.1);
    expect(convertMoney(0.1, 3, 4)).toBe(0.3);
    expect(toBase(50, { currency: "USD", exchangeRate: 0.92 })).toBe(46);
    expect(toBase(50, { currency: null, exchangeRate: null })).toBe(50);
  });

  it("курсовете на ЕЦБ се обръщат към основната валута (EUR и BGN)", async () => {
    const eur = await fetchEcbRates("EUR", fakeFetch);
    expect(eur.date).toBe("2026-11-05");
    expect(eur.rates.get("USD")).toBe(0.92165899); // 1 / 1,085
    expect(eur.rates.get("GBP")).toBe(1.19047619);
    expect(eur.rates.has("EUR")).toBe(false);
    const bgn = await fetchEcbRates("BGN", fakeFetch);
    expect(bgn.rates.get("EUR")).toBe(1.95583);
    expect(bgn.rates.get("USD")).toBe(1.80260829); // 1,95583 / 1,085
    await expect(fetchEcbRates("USD", fakeFetch)).rejects.toThrow();
  });
});
