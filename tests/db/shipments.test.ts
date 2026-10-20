import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { items, lots, orderLines, orders, shipmentLines, shipments, type ORDER_TYPES, type ShipmentDirection } from "@/db/tenant-schema";
import { changeShipmentStatus } from "@/lib/shipment-service";
import { applyMovement } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("ship");
});
const actor = { id: 1, name: "Тест" };

type Line = { itemId: number; quantity: number; lotNumber?: string; expiryDate?: string; lotId?: number };
async function shipment(direction: ShipmentDirection, lines: Line[], orderId?: number) {
  const [{ id }] = await t.db.insert(shipments).values({ reference: `SH-${Math.random().toString(36).slice(2, 8)}`, direction, locationId: t.main, orderId }).$returningId();
  await t.db.insert(shipmentLines).values(lines.map((l) => ({ shipmentId: id, ...l })));
  return id;
}
async function order(type: (typeof ORDER_TYPES)[number], lines: Array<{ itemId: number; quantity: number }>) {
  const [{ id }] = await t.db.insert(orders).values({ type, number: `PO-${Math.random().toString(36).slice(2, 8)}`, status: "confirmed" }).$returningId();
  await t.db.insert(orderLines).values(lines.map((l) => ({ orderId: id, ...l })));
  return id;
}
const qty = async (itemId: number) => (await t.db.select({ q: items.quantity }).from(items).where(eq(items.id, itemId)))[0].q;
const status = async (id: number) => (await t.db.select({ s: shipments.status }).from(shipments).where(eq(shipments.id, id)))[0].s;
const orderState = async (id: number) => {
  const o = await t.db.query.orders.findFirst({ where: eq(orders.id, id), with: { lines: true } });
  return { status: o!.status, fulfilled: o!.lines.map((l) => l.fulfilledQuantity) };
};

describe("changeShipmentStatus", () => {
  it("входяща пратка: доставката създава партиди и наличност; поръчката става частична, после изпълнена", async () => {
    const plain = await createItem(t.db);
    const lotted = await createItem(t.db, "lot");
    const po = await order("purchase", [
      { itemId: plain, quantity: 10 },
      { itemId: lotted, quantity: 6 },
    ]);

    const first = await shipment("inbound", [{ itemId: plain, quantity: 10 }, { itemId: lotted, quantity: 2, lotNumber: "P-1", expiryDate: "2027-05-01" }], po);
    await changeShipmentStatus(t.db, actor, first, "in_transit");
    expect(await qty(plain)).toBe(0); // само „доставена“ движи наличност
    await changeShipmentStatus(t.db, actor, first, "delivered");

    expect(await status(first)).toBe("delivered");
    expect(await qty(plain)).toBe(10);
    expect(await qty(lotted)).toBe(2);
    const [lot] = await t.db.select().from(lots).where(eq(lots.itemId, lotted));
    expect(lot).toMatchObject({ lotNumber: "P-1", expiryDate: "2027-05-01", quantity: 2, locationId: t.main });
    expect(await orderState(po)).toEqual({ status: "partial", fulfilled: [10, 2] });

    const second = await shipment("inbound", [{ itemId: lotted, quantity: 4, lotNumber: "P-2" }], po);
    await changeShipmentStatus(t.db, actor, second, "delivered");
    expect(await orderState(po)).toEqual({ status: "completed", fulfilled: [10, 6] });
    expect(await qty(lotted)).toBe(6);
  });

  it("изходяща пратка изписва от партидата и от наличността", async () => {
    const lotted = await createItem(t.db, "lot");
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: lotted, locationId: t.main, type: "in", quantity: 10, lot: { lotNumber: "S-1" } }));
    const [lot] = await t.db.select().from(lots).where(eq(lots.itemId, lotted));
    const so = await order("sales", [{ itemId: lotted, quantity: 3 }]);

    const id = await shipment("outbound", [{ itemId: lotted, quantity: 3, lotId: lot.id }], so);
    await changeShipmentStatus(t.db, actor, id, "delivered");
    expect(await qty(lotted)).toBe(7);
    expect((await t.db.select().from(lots).where(eq(lots.id, lot.id)))[0].quantity).toBe(7);
    expect(await orderState(so)).toEqual({ status: "completed", fulfilled: [3] });
  });

  it("втора доставка (и промяна след отказ) се отказва, без повторно движение", async () => {
    const plain = await createItem(t.db);
    const id = await shipment("inbound", [{ itemId: plain, quantity: 5 }]);
    await changeShipmentStatus(t.db, actor, id, "delivered");
    await expect(changeShipmentStatus(t.db, actor, id, "delivered")).rejects.toThrow("Доставена или отказана пратка");
    await expect(changeShipmentStatus(t.db, actor, id, "pending")).rejects.toThrow("Доставена или отказана пратка");
    expect(await qty(plain)).toBe(5);

    const cancelled = await shipment("inbound", [{ itemId: plain, quantity: 5 }]);
    await changeShipmentStatus(t.db, actor, cancelled, "cancelled");
    await expect(changeShipmentStatus(t.db, actor, cancelled, "delivered")).rejects.toThrow("Доставена или отказана пратка");
    expect(await qty(plain)).toBe(5);
  });

  it("изходяща пратка без достатъчна наличност: нито един ред не се изписва, статусът не се сменя", async () => {
    const a = await createItem(t.db);
    const b = await createItem(t.db);
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: a, locationId: t.main, type: "in", quantity: 5 }));
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: b, locationId: t.main, type: "in", quantity: 1 }));
    const id = await shipment("outbound", [{ itemId: a, quantity: 5 }, { itemId: b, quantity: 2 }]);
    await expect(changeShipmentStatus(t.db, actor, id, "delivered")).rejects.toThrow("Недостатъчна наличност");
    expect(await qty(a)).toBe(5);
    expect(await qty(b)).toBe(1);
    expect(await status(id)).toBe("pending");
  });

  it("непозната пратка", async () => {
    await expect(changeShipmentStatus(t.db, actor, 999_999, "delivered")).rejects.toThrow("Пратката не е намерена");
  });
});
