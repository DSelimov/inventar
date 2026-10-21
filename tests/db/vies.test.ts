import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkVies } from "@/lib/vies";
import { closeConnectionsAfterAll, createTenant, type TestTenant } from "../support/fixtures";

closeConnectionsAfterAll();
let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("vies");
});
afterEach(() => vi.unstubAllGlobals());

const reply = (body: object, status = 200) => vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("VIES", () => {
  it("валиден номер: име и адрес, кешира се; повторно — без заявка", async () => {
    const fetch = reply({ isValid: true, userError: "VALID", name: "ОФИС ПОЙНТ ООД", address: "ПЛОВДИВ\n ул. ГЛАВНА 5" });
    vi.stubGlobal("fetch", fetch);
    const r = await checkVies(t.db, "bg 131987651");
    expect(r).toMatchObject({ valid: true, name: "ОФИС ПОЙНТ ООД", address: "ПЛОВДИВ ул. ГЛАВНА 5", fromCache: false });
    expect(String(fetch.mock.calls[0]?.[0])).toMatch(/\/BG\/vat\/131987651$/);
    expect((await checkVies(t.db, "BG131987651")).fromCache).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("VIES не отговаря: valid = null и последният известен резултат; Гърция е EL", async () => {
    vi.stubGlobal("fetch", reply({ userError: "MS_UNAVAILABLE" }));
    const r = await checkVies(t.db, "BG131987651", { force: true });
    expect(r.valid).toBeNull();
    expect(r.message).toContain("Последна проверка: валиден");

    const fetch = reply({ isValid: false, userError: "INVALID", name: "---" });
    vi.stubGlobal("fetch", fetch);
    expect((await checkVies(t.db, "GR123456789")).valid).toBe(false);
    expect(String(fetch.mock.calls[0]?.[0])).toMatch(/\/EL\/vat\/123456789$/);
  });
});
