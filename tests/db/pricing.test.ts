import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { categories, itemPrices, items, priceChanges, priceGroups } from "@/db/tenant-schema";
import { applyBulkPrices, previewBulkPrices, readBulkParams } from "@/lib/price-groups";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
let wholesale: number;
let dealer: number;
beforeAll(async () => {
  t = await createTenant("price");
  [{ id: wholesale }] = await t.db.insert(priceGroups).values({ name: "Едро" }).$returningId();
  [{ id: dealer }] = await t.db.insert(priceGroups).values({ name: "Дилър" }).$returningId();
});
const params = (p: Record<string, string>) => readBulkParams((k) => p[k]);

describe("смяна на цени", () => {
  it("надценка върху доставната в група, само липсващите, с история", async () => {
    const [{ id: cat }] = await t.db.insert(categories).values({ name: "Напитки" }).$returningId();
    const a = await createItem(t.db, "none", { unitCost: 1.1, unitPrice: 2, categoryId: cat });
    const b = await createItem(t.db, "none", { unitCost: 3.333, unitPrice: 6, categoryId: cat });
    const other = await createItem(t.db, "none", { unitCost: 5, unitPrice: 9 });
    await t.db.insert(itemPrices).values({ itemId: b, priceGroupId: wholesale, price: 4.5 });

    const p = params({ target: String(wholesale), base: "cost", percent: "30", rounding: "0.10", category: String(cat), onlyMissing: "1" });
    const preview = await previewBulkPrices(t.db, p);
    expect(preview.map((r) => r.itemId)).toEqual([a]); // b има цена, other е в друга категория
    expect(preview[0]).toMatchObject({ base: 1.1, oldPrice: null, newPrice: 1.4 }); // 1.43 → 1.40

    expect(await applyBulkPrices(t.db, actor, p)).toBe(1);
    const [row] = await t.db.select().from(itemPrices).where(eq(itemPrices.itemId, a));
    expect(row).toMatchObject({ priceGroupId: wholesale, price: 1.4 });
    const history = await t.db.select().from(priceChanges).where(eq(priceChanges.itemId, a));
    expect(history).toMatchObject([{ target: "group", priceGroupId: wholesale, oldPrice: null, newPrice: 1.4, source: "Смяна на цени", userName: "Тест" }]);
    expect((await t.db.select().from(itemPrices).where(eq(itemPrices.itemId, other))).length).toBe(0);
  });

  it("цена на дребно −10 % с ,99; група от друга група; без промяна няма история", async () => {
    const c = await createItem(t.db, "none", { unitPrice: 20 });
    const before = (await t.db.select().from(priceChanges)).length;
    const retail = params({ target: "retail", base: "current", percent: "-10", rounding: "0.99" });
    const rows = await previewBulkPrices(t.db, retail);
    expect(rows.find((r) => r.itemId === c)).toMatchObject({ oldPrice: 20, newPrice: 17.99 }); // 18,00 → 17,99
    await applyBulkPrices(t.db, actor, retail);
    expect((await t.db.query.items.findFirst({ where: eq(items.id, c) }))!.unitPrice).toBe(17.99);

    // дилър = едро −5 %; без цена в „Едро“ базата е цената на дребно
    const d = params({ target: String(dealer), base: String(wholesale), percent: "-5", rounding: "0.01" });
    const dealerRows = await previewBulkPrices(t.db, d);
    expect(dealerRows.find((r) => r.itemId === c)).toMatchObject({ base: 17.99, newPrice: 17.09 }); // 17,0905
    await applyBulkPrices(t.db, actor, d);
    const count = (await t.db.select().from(priceChanges)).length;
    expect(count).toBeGreaterThan(before);
    expect(await applyBulkPrices(t.db, actor, d)).toBe(0); // повторно — без промени
    expect((await t.db.select().from(priceChanges)).length).toBe(count);
  });

  it("непозната група е грешка", async () => {
    await expect(previewBulkPrices(t.db, params({ target: "99999" }))).rejects.toThrow("Ценовата група");
  });
});
