import { beforeAll, describe, expect, it, vi } from "vitest";
import { shipments } from "@/db/tenant-schema";
import { alertCounts, listAlerts } from "@/lib/alerts";
import { setSetting } from "@/lib/settings";
import { applyMovement } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

let t: TestTenant;
const today = "2026-10-21";
beforeAll(async () => {
  t = await createTenant("alerts");
  const actor = { id: 1, name: "Тест" };
  const low = await createItem(t.db, "none", { minQuantity: 5 });
  const fine = await createItem(t.db, "none", { minQuantity: 5 });
  const lotted = await createItem(t.db, "lot");
  await t.db.transaction(async (tx) => {
    await applyMovement(tx, { actor, itemId: low, locationId: t.main, type: "in", quantity: 3 });
    await applyMovement(tx, { actor, itemId: fine, locationId: t.main, type: "in", quantity: 9 });
    await applyMovement(tx, { actor, itemId: lotted, locationId: t.main, type: "in", quantity: 1, lot: { lotNumber: "OLD", expiryDate: "2026-10-01" } });
    await applyMovement(tx, { actor, itemId: lotted, locationId: t.main, type: "in", quantity: 1, lot: { lotNumber: "SOON", expiryDate: "2026-11-10" } });
    await applyMovement(tx, { actor, itemId: lotted, locationId: t.main, type: "in", quantity: 1, lot: { lotNumber: "LATER", expiryDate: "2027-05-01" } });
  });
  await t.db.insert(shipments).values([
    { reference: "LATE", direction: "inbound", status: "pending", expectedDate: "2026-10-15" },
    { reference: "ONTIME", direction: "inbound", status: "in_transit", expectedDate: "2026-10-25" },
    { reference: "DONE", direction: "inbound", status: "delivered", expectedDate: "2026-10-01" },
  ]);
});

describe("известия", () => {
  it("ниска наличност, закъснели пратки, изтекли и изтичащи до 30 дни партиди", async () => {
    expect(await alertCounts(t.db, today)).toEqual({ lowStock: 1, overdue: 1, expiring: 1, expired: 1, total: 4 });
    const a = await listAlerts(t.db, today);
    expect(a.overdue.map((s) => s.reference)).toEqual(["LATE"]);
    expect(a.expired.map((l) => l.lotNumber)).toEqual(["OLD"]);
    expect(a.expiring.map((l) => l.lotNumber)).toEqual(["SOON"]);
  });

  it("без ниска наличност, ако е изключена в настройките", async () => {
    await setSetting(t.db, "lowStockAlerts", "false");
    expect((await alertCounts(t.db, today)).lowStock).toBe(0);
    expect((await listAlerts(t.db, today)).lowStock).toEqual([]);
    await setSetting(t.db, "lowStockAlerts", "true");
  });
});
