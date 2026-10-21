import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { categories, items, orderLines, orders, partners, stockMovements } from "@/db/tenant-schema";
import { loadDemoData, onboardingState, quickStart, removeDemoData } from "@/lib/onboarding";
import { applyMovement } from "@/lib/stock";
import { slugSku } from "@/lib/utils";
import { closeConnectionsAfterAll, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();
const actor = { id: 1, name: "Тест" };

describe("първи стъпки", () => {
  let t: TestTenant;
  beforeAll(async () => {
    t = await createTenant("onb");
  });

  it("бърз старт: категория, артикули с уникални кодове и начална наличност", async () => {
    expect((await onboardingState(t.db, t.org.id)).empty).toBe(true);
    const r = await quickStart(t.db, actor, { category: "Инструменти", items: [{ name: "Чук", quantity: 5, unit: "бр.", unitPrice: 12 }, { name: "Чук", quantity: 0, unit: "бр.", unitPrice: 0 }] }, slugSku);
    const rows = await t.db.select().from(items);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.sku)).size).toBe(2);
    expect(rows.every((i) => i.categoryId === r.categoryId)).toBe(true);
    expect(rows.find((i) => i.quantity === 5)).toBeTruthy();
    const s = await onboardingState(t.db, t.org.id);
    expect(s.steps.find((x) => x.key === "items")?.done).toBe(true);
    expect(s.steps.find((x) => x.key === "category")?.done).toBe(true);
    await expect(loadDemoData(t.db, actor)).rejects.toThrow("без артикули");
  });
});

describe("демо данни", () => {
  let t: TestTenant;
  beforeAll(async () => {
    t = await createTenant("demo");
  });

  it("зареждане и изтриване само на демо записите", async () => {
    await loadDemoData(t.db, actor);
    expect((await onboardingState(t.db, t.org.id)).hasDemo).toBe(true);
    expect((await t.db.select().from(items)).length).toBe(6);
    expect((await t.db.select().from(stockMovements)).length).toBe(6);

    // собствени данни на потребителя след демото
    const [{ id: own }] = await t.db.insert(items).values({ sku: "MY-1", name: "Мой артикул" }).$returningId();
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: own, locationId: t.main, type: "in", quantity: 2 }));
    const [{ id: ownPartner }] = await t.db.insert(partners).values({ name: "Мой партньор" }).$returningId();

    await removeDemoData(t.db);
    expect((await t.db.select().from(items)).map((i) => i.sku)).toEqual(["MY-1"]);
    expect((await t.db.select().from(partners)).map((p) => p.id)).toEqual([ownPartner]);
    expect(await t.db.select().from(orders)).toEqual([]);
    expect((await t.db.select().from(categories)).filter((c) => c.name.startsWith("Демо"))).toEqual([]);
    expect((await t.db.select().from(stockMovements).where(eq(stockMovements.itemId, own))).length).toBe(1);
    expect((await onboardingState(t.db, t.org.id)).hasDemo).toBe(false);
    await expect(removeDemoData(t.db)).rejects.toThrow("Няма заредени демо данни");
  });

  it("демо артикул в истинска поръчка: изтриването се отказва и нищо не се губи", async () => {
    const u = await createTenant("onb2");
    await loadDemoData(u.db, actor);
    const [demoItem] = await u.db.select().from(items).limit(1);
    const [{ id: real }] = await u.db.insert(orders).values({ type: "sales", number: "МОЯ-1", status: "confirmed" }).$returningId();
    await u.db.insert(orderLines).values({ orderId: real, itemId: demoItem.id, quantity: 1 });

    await expect(removeDemoData(u.db)).rejects.toThrow("вече се използват");
    expect((await u.db.select().from(orderLines).where(eq(orderLines.orderId, real))).length).toBe(1);
    expect((await u.db.select().from(items)).length).toBe(6);
  });
});
