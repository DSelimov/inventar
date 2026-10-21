import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { controlDb } from "@/db/control";
import { organizations } from "@/db/control-schema";
import { auditLog, items, orderLines, orders, settings, stockMovements } from "@/db/tenant-schema";
import { bgnToEur } from "@/lib/currency";
import { convertTenantToEuro, EURO_MARKER } from "@/lib/euro";
import { applyMovement } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
const orgOf = async (t: TestTenant) => (await controlDb.select().from(organizations).where(eq(organizations.id, t.org.id)))[0];

describe("bgnToEur", () => {
  it("по фиксирания курс, половинката далеч от нулата", () => {
    expect(bgnToEur(1.95583)).toBe(1);
    expect(bgnToEur(24.9)).toBe(12.73);
    expect(bgnToEur(12.5, 4)).toBe(6.3911);
    expect(bgnToEur(19, 4)).toBe(9.7145);
    expect(bgnToEur(0.01)).toBe(0.01);
    expect(bgnToEur(0)).toBe(0);
    expect(bgnToEur(-24.9)).toBe(-12.73);
  });
});

describe("превалутиране BGN → EUR", () => {
  let t: TestTenant;
  let item: number;
  let sale: number;
  let purchase: number;
  beforeAll(async () => {
    t = await createTenant("euro");
    await controlDb.update(organizations).set({ currency: "BGN" }).where(eq(organizations.id, t.org.id));
    item = await createItem(t.db, "none", { unitCost: 12.5, unitPrice: 24.9 });
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: item, locationId: t.main, type: "in", quantity: 4, unitCost: 12.5 }));
    [{ id: sale }] = await t.db.insert(orders).values({ type: "sales", number: "ПР-1", status: "confirmed" }).$returningId();
    [{ id: purchase }] = await t.db.insert(orders).values({ type: "purchase", number: "ПЗ-1", status: "confirmed" }).$returningId();
    await t.db.insert(orderLines).values([
      { orderId: sale, itemId: item, quantity: 3, unitPrice: 9.4 },
      { orderId: purchase, itemId: item, quantity: 10, unitPrice: 19 },
    ]);
  });

  it("dry-run не променя нищо", async () => {
    const r = await convertTenantToEuro(await orgOf(t), actor, { dryRun: true });
    expect(r).toMatchObject({ status: "converted", items: 1, orderLines: 2, orders: 2 });
    expect((await t.db.select().from(items).where(eq(items.id, item)))[0].unitPrice).toBe(24.9);
    expect((await orgOf(t)).currency).toBe("BGN");
  });

  it("цени, поръчки с оригиналните суми, валута, одит — и само веднъж", async () => {
    const [first, second] = await Promise.all([convertTenantToEuro(await orgOf(t), actor), convertTenantToEuro(await orgOf(t), actor)]);
    expect([first.status, second.status].sort()).toEqual(["already", "converted"]);

    const [it] = await t.db.select().from(items).where(eq(items.id, item));
    expect([it.unitCost, it.unitPrice]).toEqual([6.3911, 12.73]);
    const lines = await t.db.select().from(orderLines).orderBy(orderLines.id);
    expect(lines.map((l) => [l.unitPrice, l.originalUnitPrice])).toEqual([
      [4.81, 9.4], // клиентска: до стотинка
      [9.7145, 19], // доставка: 4 знака
    ]);
    expect((await t.db.select().from(orders)).map((o) => o.originalCurrency)).toEqual(["BGN", "BGN"]);
    const [m] = await t.db.select().from(stockMovements).where(eq(stockMovements.itemId, item));
    expect([m.unitCost, m.value]).toEqual([6.3911, 25.56]); // 50 лв. → 25,56 €
    expect((await orgOf(t)).currency).toBe("EUR");
    expect((await t.db.select().from(settings).where(eq(settings.key, EURO_MARKER))).length).toBe(1);
    expect((await t.db.select().from(auditLog).where(eq(auditLog.action, "currency"))).length).toBe(1);

    // повторно: организацията вече е в евро → нищо не се пипа
    expect((await convertTenantToEuro(await orgOf(t), actor)).status).toBe("not-bgn");
    expect((await t.db.select().from(items).where(eq(items.id, item)))[0].unitPrice).toBe(12.73);
  });

  it("прекъсване след базата на клиента: повторното извикване само сменя валутата", async () => {
    await controlDb.update(organizations).set({ currency: "BGN" }).where(eq(organizations.id, t.org.id));
    expect((await convertTenantToEuro(await orgOf(t), actor)).status).toBe("already");
    expect((await orgOf(t)).currency).toBe("EUR");
    expect((await t.db.select().from(items).where(eq(items.id, item)))[0].unitPrice).toBe(12.73);
  });
});
