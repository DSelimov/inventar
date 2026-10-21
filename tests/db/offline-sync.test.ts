import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { items, offlineActions, stockMovements } from "@/db/tenant-schema";
import { processAction } from "@/lib/offline-sync";
import { applyMovement } from "@/lib/stock";
import { createStockCount } from "@/lib/stock-count";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Склад (телефон)" };
let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("offl");
});
const qty = async (id: number) => (await t.db.select().from(items).where(eq(items.id, id)))[0].quantity;

describe("мобилен режим: синхронизация на опашката", () => {
  it("едно и също действие (повторно и паралелно изпращане) се прилага само веднъж", async () => {
    const item = await createItem(t.db);
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: item, locationId: t.main, type: "in", quantity: 10 }));
    const action = { id: randomUUID(), kind: "movement" as const, recordedAt: new Date().toISOString(), payload: { itemId: item, locationId: t.main, type: "out" as const, quantity: 3 } };
    const [a, b] = await Promise.all([processAction(t.db, actor, action), processAction(t.db, actor, action)]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    expect([a.duplicate, b.duplicate].filter(Boolean)).toHaveLength(1);
    expect((await processAction(t.db, actor, action)).duplicate).toBe(true);
    expect(await qty(item)).toBe(7);
    expect((await t.db.select().from(stockMovements).where(eq(stockMovements.itemId, item))).length).toBe(2);
  });

  it("неуспехът се записва: при повторно изпращане същата грешка, без движение", async () => {
    const item = await createItem(t.db);
    const action = { id: randomUUID(), kind: "movement" as const, recordedAt: new Date().toISOString(), payload: { itemId: item, locationId: t.main, type: "out" as const, quantity: 5 } };
    const first = await processAction(t.db, actor, action);
    expect(first).toMatchObject({ ok: false, message: expect.stringContaining("Недостатъчна") });
    expect(await processAction(t.db, actor, action)).toMatchObject({ ok: false, duplicate: true });
    const [row] = await t.db.select().from(offlineActions).where(eq(offlineActions.id, action.id));
    expect(row.ok).toBe(false);
  });

  it("броене от телефона", async () => {
    const item = await createItem(t.db, "none", { barcode: `M${Date.now()}` });
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: item, locationId: t.main, type: "in", quantity: 4 }));
    const c = await createStockCount(t.db, { locationId: t.main, createdBy: "Тест" });
    const code = (await t.db.select().from(items).where(eq(items.id, item)))[0].barcode!;
    const r = await processAction(t.db, actor, { id: randomUUID(), kind: "count", recordedAt: new Date().toISOString(), payload: { countId: c.id, code, quantity: 2 } });
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining("преброени 2") });
  });
});
