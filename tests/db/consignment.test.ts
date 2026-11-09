import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { itemPrices, items, locations, orderLines, orders, partners, priceGroups, stockLevels } from "@/db/tenant-schema";
import { partnerBalance } from "@/lib/cash";
import { consignmentStock, runConsignment } from "@/lib/consignment";
import { applyMovement } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
let shop: number;
beforeAll(async () => {
  t = await createTenant("ksg");
  const [{ id: g }] = await t.db.insert(priceGroups).values({ name: "Дистрибутор" }).$returningId();
  [{ id: shop }] = await t.db.insert(partners).values({ name: "Книжарница", type: "customer", priceGroupId: g, discountPercent: 10 }).$returningId();
});
const level = async (itemId: number, locationId: number) => (await t.db.select().from(stockLevels).where(eq(stockLevels.itemId, itemId))).find((l) => l.locationId === locationId)?.quantity ?? 0;

describe("консигнация", () => {
  it("даване → отчет за продадено (продажба по групата − отстъпката) → връщане", async () => {
    const book = await createItem(t.db, "none", { unitPrice: 20 });
    const [g] = await t.db.select().from(priceGroups);
    await t.db.insert(itemPrices).values({ itemId: book, priceGroupId: g.id, price: 15 });
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: book, locationId: t.main, type: "in", quantity: 10, unitCost: 8 }));

    const give = await runConsignment(t.db, actor, { kind: "give", partnerId: shop, warehouseId: t.main, lines: [{ itemId: book, quantity: 6 }] });
    expect(give.number).toMatch(/^КСГ-\d{4}-001$/);
    const [loc] = await t.db.select().from(locations).where(eq(locations.partnerId, shop));
    expect(loc.name).toBe("Консигнация: Книжарница");
    expect(await level(book, t.main)).toBe(4);
    expect(await level(book, loc.id)).toBe(6);
    expect((await t.db.query.items.findFirst({ where: eq(items.id, book) }))!).toMatchObject({ quantity: 10, unitCost: 8 }); // още е наша
    expect(await consignmentStock(t.db, shop)).toMatchObject([{ itemId: book, quantity: 6 }]);
    expect((await partnerBalance(t.db, shop)).receivable).toBe(0); // няма вземане, докато не е продадено

    const report = await runConsignment(t.db, actor, { kind: "report", partnerId: shop, lines: [{ itemId: book, quantity: 4 }] });
    const [order] = await t.db.select().from(orders).where(eq(orders.id, report.orderId!));
    expect(order).toMatchObject({ type: "sales", status: "completed", partnerId: shop, locationId: loc.id });
    const [line] = await t.db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    expect(line).toMatchObject({ quantity: 4, fulfilledQuantity: 4, unitPrice: 13.5 }); // 15 − 10 %
    expect(await level(book, loc.id)).toBe(2);
    expect((await partnerBalance(t.db, shop)).receivable).toBe(64.8); // 4 × 13,50 × 1,2

    await runConsignment(t.db, actor, { kind: "return", partnerId: shop, warehouseId: t.main, lines: [{ itemId: book, quantity: 2 }] });
    expect(await level(book, loc.id)).toBe(0);
    expect(await level(book, t.main)).toBe(6);
    expect(await consignmentStock(t.db, shop)).toEqual([]);

    await expect(runConsignment(t.db, actor, { kind: "report", partnerId: shop, lines: [{ itemId: book, quantity: 1 }] })).rejects.toThrow(/Недостатъчна наличност/);
  });

  it("без партиди; отчет без даване е грешка", async () => {
    const lot = await createItem(t.db, "lot");
    await expect(runConsignment(t.db, actor, { kind: "give", partnerId: shop, warehouseId: t.main, lines: [{ itemId: lot, quantity: 1 }] })).rejects.toThrow("партиди");
    const [{ id: other }] = await t.db.insert(partners).values({ name: "Друг" }).$returningId();
    const x = await createItem(t.db);
    await expect(runConsignment(t.db, actor, { kind: "report", partnerId: other, lines: [{ itemId: x, quantity: 1 }] })).rejects.toThrow("няма стока на консигнация");
  });
});
