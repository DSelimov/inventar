import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyMovement, assertLocationAccess, transferStock } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("scope");
});

describe("достъп до локации", () => {
  it("служител, ограничен до магазина: движения само там; трансфер към чужд склад е отказан", async () => {
    const item = await createItem(t.db);
    const admin = { id: 1, name: "Админ", locations: null };
    const clerk = { id: 2, name: "Продавач", locations: [t.shop] };
    await t.db.transaction(async (tx) => {
      await applyMovement(tx, { actor: admin, itemId: item, locationId: t.main, type: "in", quantity: 10 });
      await applyMovement(tx, { actor: admin, itemId: item, locationId: t.shop, type: "in", quantity: 5 });
    });
    await expect(t.db.transaction((tx) => applyMovement(tx, { actor: clerk, itemId: item, locationId: t.main, type: "out", quantity: 1 }))).rejects.toThrow("Нямате достъп");
    const r = await t.db.transaction((tx) => applyMovement(tx, { actor: clerk, itemId: item, locationId: t.shop, type: "out", quantity: 1 }));
    expect(r.after).toBe(14);
    await expect(transferStock(t.db, { actor: clerk, itemId: item, fromLocationId: t.shop, toLocationId: t.main, quantity: 1 })).rejects.toThrow("Нямате достъп");
    await transferStock(t.db, { actor: admin, itemId: item, fromLocationId: t.main, toLocationId: t.shop, quantity: 2 });
  });

  it("без ограничение (null/празно) — всички локации", () => {
    expect(() => assertLocationAccess({ locations: null }, 5)).not.toThrow();
    expect(() => assertLocationAccess(null, 5)).not.toThrow();
    expect(() => assertLocationAccess({ locations: [1, 2] }, 2)).not.toThrow();
    expect(() => assertLocationAccess({ locations: [1, 2] }, 3)).toThrow();
  });
});
