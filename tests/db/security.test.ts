import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiKeys, items } from "@/db/tenant-schema";
import { sha256 } from "@/lib/auth-crypto";
import { clear, hit, retryAfter } from "@/lib/rate-limit";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
// лимитът се чете при зареждане на api.ts → задава се преди динамичния import по-долу
process.env.API_RATE_LIMIT = "3";
closeConnectionsAfterAll();

let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("sec");
});

async function apiKey() {
  const token = `inv_${randomBytes(16).toString("hex")}`;
  await t.db.insert(apiKeys).values({ name: "test", prefix: token.slice(0, 12), keyHash: sha256(token), scopes: ["read", "write"] });
  return token;
}
const req = (path: string, token: string, init: { method?: string; body?: unknown } = {}) => {
  const host = `${t.org.subdomain}.inventar.test`;
  return new Request(`https://${host}${path}`, {
    method: init.method ?? "GET",
    headers: { host, authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
};

describe("лимит на опитите (вход)", () => {
  it("блокира след max опита в прозореца и се изчиства", async () => {
    const limit = { key: `test:${Date.now()}`, max: 3, windowMs: 60_000 };
    expect(await retryAfter(limit)).toBe(0);
    for (let i = 0; i < 2; i++) await hit(limit);
    expect(await retryAfter(limit)).toBe(0);
    await hit(limit);
    const wait = await retryAfter(limit);
    expect(wait).toBeGreaterThan(55);
    expect(wait).toBeLessThanOrEqual(60);
    await clear(limit.key);
    expect(await retryAfter(limit)).toBe(0);
  });

  it("нов прозорец след изтичане на стария", async () => {
    const limit = { key: `test-exp:${Date.now()}`, max: 2, windowMs: 300 };
    await hit(limit);
    await hit(limit);
    expect(await retryAfter(limit)).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 350));
    expect(await retryAfter(limit)).toBe(0);
    await hit(limit); // броячът започва отначало
    expect(await retryAfter(limit)).toBe(0);
  });
});

describe("REST API: лимит и грешки", () => {
  it("лимит на ключ: заглавия, 429 с Retry-After, друг ключ не е засегнат", async () => {
    const { GET } = await import("@/app/api/v1/items/route");
    const key = await apiKey();
    const statuses = [];
    let last: Response | undefined;
    for (let i = 0; i < 4; i++) {
      last = await GET(req("/api/v1/items", key));
      statuses.push(last.status);
      if (i === 0) {
        expect(last.headers.get("X-RateLimit-Limit")).toBe("3");
        expect(last.headers.get("X-RateLimit-Remaining")).toBe("2");
        expect(Number(last.headers.get("X-RateLimit-Reset"))).toBeGreaterThan(Date.now() / 1000);
      }
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(Number(last!.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await last!.json()).error).toContain("Превишен лимит");
    expect((await GET(req("/api/v1/items", await apiKey()))).status).toBe(200);
  });

  it("дублиран sku при PATCH → 409 без детайли за базата", async () => {
    const { PATCH } = await import("@/app/api/v1/items/[id]/route");
    await createItem(t.db, "none", { sku: "DUP-1" });
    const id = await createItem(t.db);
    const res = await PATCH(req(`/api/v1/items/${id}`, await apiKey(), { method: "PATCH", body: { sku: "DUP-1" } }), { params: Promise.resolve({ id: String(id) }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).not.toMatch(/Duplicate|items_sku|sql/i);
    expect((await t.db.select().from(items).where(eq(items.id, id)))[0].sku).not.toBe("DUP-1");
  });

  it("несъществуваща категория → 422", async () => {
    const { POST } = await import("@/app/api/v1/items/route");
    const res = await POST(req("/api/v1/items", await apiKey(), { method: "POST", body: { name: "X", categoryId: 999_999 } }));
    expect(res.status).toBe(422);
  });
});
