import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { controlDb } from "@/db/control";
import { organizations, plans } from "@/db/control-schema";
import { apiKeys, items } from "@/db/tenant-schema";
import { authenticate } from "@/lib/api";
import { sha256 } from "@/lib/auth-crypto";
import { assertWithinLimit, usage } from "@/lib/plans";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

closeConnectionsAfterAll();

let t: TestTenant;
let org: typeof organizations.$inferSelect;
beforeAll(async () => {
  t = await createTenant("plan");
  const [{ id: planId }] = await controlDb.insert(plans).values({ code: `t-${t.org.id}`, name: "Тестов", maxItems: 2, maxLocations: 2, apiAccess: false }).$returningId();
  await controlDb.update(organizations).set({ planId, subscriptionStatus: "active" }).where(eq(organizations.id, t.org.id));
  [org] = await controlDb.select().from(organizations).where(eq(organizations.id, t.org.id));
});

describe("лимити на плана", () => {
  it("артикули и локации до лимита; празен лимит = без ограничение", async () => {
    await createItem(t.db);
    await assertWithinLimit({ org, db: t.db }, "items");
    await createItem(t.db);
    await expect(assertWithinLimit({ org, db: t.db }, "items")).rejects.toThrow("до 2 артикули");
    await expect(assertWithinLimit({ org, db: t.db }, "locations")).rejects.toThrow("до 2 локации"); // main + shop
    await assertWithinLimit({ org, db: t.db }, "users", 50); // без лимит за потребители
    expect((await usage(org, t.db)).items).toBe((await t.db.select().from(items)).length);
  });

  it("API: планът без API отказва с 403", async () => {
    const token = `inv_test_${t.org.id}_${Date.now()}`;
    await t.db.insert(apiKeys).values({ name: "тест", keyHash: sha256(token), prefix: token.slice(0, 12), scopes: ["read"] });
    const host = `${t.org.subdomain}.inventar.test`;
    const req = new Request(`https://${host}/api/v1/items`, { headers: { authorization: `Bearer ${token}`, host } });
    await expect(authenticate(req, "read")).rejects.toMatchObject({ status: 403, message: expect.stringContaining("не включва API") });
  });
});
