import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { itemSuppliers, orderLines, orders, partners, settings, stockMovements } from "@/db/tenant-schema";
import { createDraftPurchaseOrders, replenishmentSuggestions } from "@/lib/replenishment";
import { applyMovement } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("repl");
  await t.db.insert(settings).values([
    { key: "windowDays", value: "10" },
    { key: "safetyDays", value: "2" },
    { key: "leadTimeDays", value: "7" },
  ]);
});
const move = (itemId: number, type: "in" | "out", quantity: number) => t.db.transaction((tx) => applyMovement(tx, { actor, itemId, locationId: t.main, type, quantity }));

describe("предложения за поръчка", () => {
  it("консумация × (срок на доставчика + буфер) + минимум − наличност − очаквано; минимално количество; по доставчик; чернови", async () => {
    const [{ id: sup }] = await t.db.insert(partners).values({ name: "Доставчик А", type: "supplier", leadTimeDays: 10 }).$returningId();
    const fast = await createItem(t.db, "none", { minQuantity: 5, unitCost: 2 });
    await move(fast, "in", 100);
    await move(fast, "out", 80); // 8/ден за 10 дни; остават 20
    await t.db.insert(itemSuppliers).values({ itemId: fast, partnerId: sup, preferred: true, leadTimeDays: 3, purchasePrice: 1.5, minOrderQuantity: 50 });
    const slow = await createItem(t.db, "none", { minQuantity: 0 });
    await move(slow, "in", 10);
    await move(slow, "out", 1);

    const groups = await replenishmentSuggestions(t.db);
    const a = groups.find((g) => g.supplierId === sup)!;
    const row = a.rows.find((r) => r.item.id === fast)!;
    // 8 × (3 + 2) + 5 = 45 цел; 45 − 20 = 25 → минимумът на доставчика 50
    expect(row).toMatchObject({ target: 45, leadDays: 3, quantity: 50, unitPrice: 1.5, value: 75, daysLeft: 2 });
    expect(groups.flatMap((g) => g.rows).some((r) => r.item.id === slow)).toBe(false); // 0,1/ден × 9 дни < 9 налични

    // потвърдена поръчка за доставка се брои като очаквано
    const created = await createDraftPurchaseOrders(t.db, [{ itemId: fast, supplierId: sup, quantity: 50, unitPrice: 1.5 }], actor.id);
    expect(created).toHaveLength(1);
    const [po] = await t.db.select().from(orders).where(eq(orders.id, created[0].id));
    expect(po).toMatchObject({ type: "purchase", status: "draft", partnerId: sup });
    expect((await t.db.select().from(orderLines).where(eq(orderLines.orderId, po.id)))[0]).toMatchObject({ quantity: 50, unitPrice: 1.5, vatRate: 20 });
    await t.db.update(orders).set({ status: "confirmed" }).where(eq(orders.id, po.id));
    expect((await replenishmentSuggestions(t.db)).flatMap((g) => g.rows).some((r) => r.item.id === fast)).toBe(false);
    expect((await t.db.select().from(stockMovements).where(eq(stockMovements.itemId, fast))).length).toBe(2);
  });
});
