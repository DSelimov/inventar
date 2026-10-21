import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { costLayers, items, orderLines, orders, settings, shipmentLines, shipments, stockMovements, type ORDER_TYPES, type ShipmentDirection } from "@/db/tenant-schema";
import { changeShipmentStatus } from "@/lib/shipment-service";
import { applyMovement, transferStock, type MovementInput } from "@/lib/stock";
import { localTodayIso } from "@/lib/dates";
import { VALUATION_KEY } from "@/lib/valuation";
import { salesMargin, stockValueAt } from "@/lib/valuation-reports";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };

function helpers(get: () => TestTenant) {
  const move = (input: Omit<MovementInput, "actor">) => get().db.transaction((tx) => applyMovement(tx, { actor, ...input }));
  const item = async (id: number) => (await get().db.select().from(items).where(eq(items.id, id)))[0];
  const lastMove = async (id: number) => (await get().db.select().from(stockMovements).where(eq(stockMovements.itemId, id)).orderBy(sql`${stockMovements.id} desc`).limit(1))[0];
  const ledger = async (id: number) => (await get().db.select({ v: sql<number>`sum(${stockMovements.value})`.mapWith(Number) }).from(stockMovements).where(eq(stockMovements.itemId, id)))[0].v;
  async function order(type: (typeof ORDER_TYPES)[number], lines: Array<{ itemId: number; quantity: number; unitPrice: number }>) {
    const [{ id }] = await get().db.insert(orders).values({ type, number: `O-${Math.random().toString(36).slice(2, 8)}`, status: "confirmed" }).$returningId();
    await get().db.insert(orderLines).values(lines.map((l) => ({ orderId: id, ...l })));
    return id;
  }
  async function deliver(direction: ShipmentDirection, lines: Array<{ itemId: number; quantity: number; unitCost?: number }>, orderId?: number, isReturn = false) {
    const [{ id }] = await get().db.insert(shipments).values({ reference: `SH-${Math.random().toString(36).slice(2, 8)}`, direction, locationId: get().main, orderId, isReturn }).$returningId();
    await get().db.insert(shipmentLines).values(lines.map((l) => ({ shipmentId: id, ...l })));
    await changeShipmentStatus(get().db, actor, id, "delivered");
    return id;
  }
  return { move, item, lastMove, ledger, order, deliver };
}

describe("средно претеглена (по подразбиране)", () => {
  let t: TestTenant;
  beforeAll(async () => {
    t = await createTenant("avg");
  });
  const h = helpers(() => t);

  it("приходи по различни цени, разход, трансфер, корекция при броене", async () => {
    const id = await createItem(t.db);
    await h.move({ itemId: id, locationId: t.main, type: "in", quantity: 10, unitCost: 10 });
    await h.move({ itemId: id, locationId: t.main, type: "in", quantity: 10, unitCost: 13 });
    expect((await h.item(id)).unitCost).toBe(11.5);

    await h.move({ itemId: id, locationId: t.main, type: "out", quantity: 5 });
    expect(await h.lastMove(id)).toMatchObject({ unitCost: 11.5, value: -57.5 });
    expect((await h.item(id)).unitCost).toBe(11.5);

    await transferStock(t.db, { actor, itemId: id, fromLocationId: t.main, toLocationId: t.shop, quantity: 3 });
    expect((await h.item(id)).unitCost).toBe(11.5);
    expect(await h.ledger(id)).toBe(172.5); // 15 × 11,5 — трансферът се неутрализира

    await h.move({ itemId: id, locationId: t.main, type: "adjust", quantity: 14 }); // 12 → 14 в основния склад
    expect(await h.lastMove(id)).toMatchObject({ unitCost: 11.5, value: 23 });
    expect(await h.ledger(id)).toBe(195.5);
  });

  it("доставка по поръчка (цена от поръчката или от реда), връщания по оригиналната цена", async () => {
    const id = await createItem(t.db, "none", { unitCost: 10 });
    const po = await h.order("purchase", [{ itemId: id, quantity: 10, unitPrice: 12 }]);
    await h.deliver("inbound", [{ itemId: id, quantity: 10 }], po);
    expect(await h.lastMove(id)).toMatchObject({ unitCost: 12, value: 120 });
    await h.deliver("inbound", [{ itemId: id, quantity: 10, unitCost: 18 }]); // без поръчка, цена на реда
    expect((await h.item(id)).unitCost).toBe(15);

    // връщане към доставчик: по 12, на която е получено, а не по средната 15
    await h.deliver("outbound", [{ itemId: id, quantity: 2 }], po, true);
    expect(await h.lastMove(id)).toMatchObject({ unitCost: 12, value: -24 });
    expect((await h.item(id)).unitCost).toBe(15.3333); // (300 − 24) / 18

    // продажба и връщане от клиент по себестойността при продажбата
    const so = await h.order("sales", [{ itemId: id, quantity: 4, unitPrice: 30 }]);
    await h.deliver("outbound", [{ itemId: id, quantity: 4 }], so);
    expect(await h.lastMove(id)).toMatchObject({ unitCost: 15.3333, value: -61.33 });
    await h.move({ itemId: id, locationId: t.main, type: "in", quantity: 6, unitCost: 20 }); // средната се мести
    await h.deliver("inbound", [{ itemId: id, quantity: 1 }], so, true);
    expect((await h.lastMove(id)).unitCost).toBe(15.3333);
  });
});

describe("FIFO", () => {
  let t: TestTenant;
  beforeAll(async () => {
    t = await createTenant("fifo");
    await t.db.insert(settings).values({ key: VALUATION_KEY, value: "fifo" });
  });
  const h = helpers(() => t);

  it("разходът изчерпва най-старите слоеве; трансферът не ги пипа", async () => {
    const id = await createItem(t.db);
    await h.move({ itemId: id, locationId: t.main, type: "in", quantity: 10, unitCost: 10 });
    await h.move({ itemId: id, locationId: t.main, type: "in", quantity: 10, unitCost: 13 });
    await h.move({ itemId: id, locationId: t.main, type: "out", quantity: 15 });
    expect(await h.lastMove(id)).toMatchObject({ value: -165, unitCost: 11 }); // 10 × 10 + 5 × 13
    expect((await h.item(id)).unitCost).toBe(13);

    await transferStock(t.db, { actor, itemId: id, fromLocationId: t.main, toLocationId: t.shop, quantity: 2 });
    const layers = await t.db.select().from(costLayers).where(eq(costLayers.itemId, id));
    expect(layers.map((l) => l.quantity)).toEqual([0, 5]);
    expect(await h.ledger(id)).toBe(65);
  });

  it("връщане към доставчик изписва от слоя на поръчката; връщане от клиент е нов слой по цената при продажбата", async () => {
    const id = await createItem(t.db);
    await h.move({ itemId: id, locationId: t.main, type: "in", quantity: 5, unitCost: 8 });
    const po = await h.order("purchase", [{ itemId: id, quantity: 5, unitPrice: 20 }]);
    await h.deliver("inbound", [{ itemId: id, quantity: 5 }], po);
    await h.deliver("outbound", [{ itemId: id, quantity: 2 }], po, true);
    expect(await h.lastMove(id)).toMatchObject({ value: -40, unitCost: 20 }); // не най-старият слой по 8

    const so = await h.order("sales", [{ itemId: id, quantity: 6, unitPrice: 50 }]);
    await h.deliver("outbound", [{ itemId: id, quantity: 6 }], so); // 5 × 8 + 1 × 20
    expect(await h.lastMove(id)).toMatchObject({ value: -60, unitCost: 10 });
    await h.deliver("inbound", [{ itemId: id, quantity: 1 }], so, true);
    expect(await h.lastMove(id)).toMatchObject({ value: 10, unitCost: 10 });
    expect(await h.ledger(id)).toBe(50); // 2 × 20 + 1 × 10
    expect((await h.item(id)).unitCost).toBe(16.6667);
  });
});

describe("справки: стойност към дата, себестойност и марж", () => {
  let t: TestTenant;
  beforeAll(async () => {
    t = await createTenant("valrep");
  });
  const h = helpers(() => t);

  it("стойността към дата е сумата на движенията до края на деня; маржът е по цената от поръчката", async () => {
    const id = await createItem(t.db, "none", { unitPrice: 99 });
    await h.move({ itemId: id, locationId: t.main, type: "in", quantity: 10, unitCost: 10 });
    // движение „вчера“ (по София): не влиза в стойността към завчера
    await t.db.update(stockMovements).set({ createdAt: new Date("2026-03-10T10:00:00Z") }).where(eq(stockMovements.itemId, id));
    expect((await stockValueAt(t.db, "2026-03-09")).rows.find((r) => r.itemId === id)).toBeUndefined();
    expect((await stockValueAt(t.db, "2026-03-10")).rows.find((r) => r.itemId === id)).toMatchObject({ quantity: 10, value: 100 });

    const so = await h.order("sales", [{ itemId: id, quantity: 4, unitPrice: 25 }]);
    await h.deliver("outbound", [{ itemId: id, quantity: 4 }], so);
    await h.deliver("inbound", [{ itemId: id, quantity: 1 }], so, true); // връщане от клиент
    const today = localTodayIso();
    const m = await salesMargin(t.db, today, today);
    const { sku } = await h.item(id);
    const row = m.items.find((r) => r.sku === sku)!;
    expect(row).toMatchObject({ quantity: 3, revenue: 75, cost: 30, margin: 45 });
    expect(m.totals.marginPct).toBeCloseTo(60);
    expect((await stockValueAt(t.db, today)).rows.find((r) => r.itemId === id)).toMatchObject({ quantity: 7, value: 70 });
  });
});
