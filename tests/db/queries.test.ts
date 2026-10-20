import { beforeAll, describe, expect, it, vi } from "vitest";
import { orderLines, orders, partners } from "@/db/tenant-schema";
import { PAGE_SIZE } from "@/lib/paging";
import { pageItems, pageMovements, pageOrders } from "@/lib/queries";
import { applyMovement } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

let t: TestTenant;
const actor = { id: 7, name: "Мария" };
beforeAll(async () => {
  t = await createTenant("q");
  for (let i = 1; i <= 60; i++) await createItem(t.db, "none", { name: `Винт ${String(i).padStart(2, "0")}`, sku: `VNT-${i}` });
  const inShop = await createItem(t.db, "none", { name: "Само в магазина", sku: "SHOP-1" });
  await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: inShop, locationId: t.shop, type: "in", quantity: 3, reason: "Зареждане" }));
});

// Филтрите с подзаявки към други таблици (по локация, по артикул, по партньор) се счупиха веднъж,
// защото релационните заявки преименуват колоните в sql`` — тези тестове ги пазят.
describe("странициране и филтри", () => {
  it("pageItems: 50 на страница, общ брой и последна страница", async () => {
    const p1 = await pageItems(t.db, { q: "Винт" }, 1);
    expect(p1.rows).toHaveLength(PAGE_SIZE);
    expect(p1.total).toBe(60);
    const p2 = await pageItems(t.db, { q: "винт" }, 2);
    expect(p2.rows.map((r) => r.name)).toEqual(Array.from({ length: 10 }, (_, i) => `Винт ${51 + i}`));
  });

  it("pageItems: филтър по локация", async () => {
    const r = await pageItems(t.db, { locationId: t.shop }, 1);
    expect(r.rows.map((i) => i.sku)).toEqual(["SHOP-1"]);
    expect((await pageItems(t.db, { locationId: t.main }, 1)).total).toBe(0);
  });

  it("pageMovements: търсене по код на артикул, тип, потребител и дати", async () => {
    expect((await pageMovements(t.db, { q: "SHOP-1" }, 1)).total).toBe(1);
    expect((await pageMovements(t.db, { q: "Зареждане" }, 1)).total).toBe(1);
    expect((await pageMovements(t.db, { q: "VNT" }, 1)).total).toBe(0);
    expect((await pageMovements(t.db, { type: "out" }, 1)).total).toBe(0);
    expect((await pageMovements(t.db, { userId: 7 }, 1)).rows[0].userName).toBe("Мария");
    const today = new Date().toISOString().slice(0, 10);
    expect((await pageMovements(t.db, { from: today, to: today }, 1)).total).toBe(1);
    expect((await pageMovements(t.db, { to: "2020-01-01" }, 1)).total).toBe(0);
  });

  it("pageOrders: търсене по име на партньор", async () => {
    const [{ id: partnerId }] = await t.db.insert(partners).values({ name: "Метал ООД", type: "supplier" }).$returningId();
    const [{ id }] = await t.db.insert(orders).values({ type: "purchase", number: "ПЗ-1", partnerId }).$returningId();
    await t.db.insert(orderLines).values({ orderId: id, itemId: (await pageItems(t.db, {}, 1)).rows[0].id, quantity: 1 });
    expect((await pageOrders(t.db, { q: "метал" }, 1)).rows.map((o) => o.number)).toEqual(["ПЗ-1"]);
    expect((await pageOrders(t.db, { q: "ПЗ-1" }, 1)).total).toBe(1);
    expect((await pageOrders(t.db, { q: "няма" }, 1)).total).toBe(0);
  });
});
