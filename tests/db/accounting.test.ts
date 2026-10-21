import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { invoices, partners, shipmentLines, shipments } from "@/db/tenant-schema";
import { purchasesList, salesJournal } from "@/lib/accounting";
import { localTodayIso } from "@/lib/dates";
import { cancelInvoice, createDraft, draftNoteFor, issueInvoice, saveDraft } from "@/lib/invoicing";
import { setSetting } from "@/lib/settings";
import { changeShipmentStatus } from "@/lib/shipment-service";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
let partnerId: number;
beforeAll(async () => {
  t = await createTenant("acc");
  for (const [k, v] of Object.entries({ legalName: "Демо ЕООД", eik: "123456786", vatNumber: "BG123456786", address: "София" })) await setSetting(t.db, `company.${k}`, v);
  [{ id: partnerId }] = await t.db.insert(partners).values({ name: "Клиент", address: "Варна", eik: "205123457" }).$returningId();
});

describe("за счетоводителя", () => {
  it("продажби: основа и ДДС по ставка; кредитно известие с минус; анулирана с нули", async () => {
    const today = localTodayIso();
    const a = await createDraft(t.db, { kind: "invoice", partnerId, currency: "EUR", lines: [{ description: "Стока", quantity: 2, unit: "бр.", unitPrice: 50 }] }, "Тест");
    await issueInvoice(t.db, a, actor);
    const credit = await draftNoteFor(t.db, a, "credit_note", "Тест");
    const [line] = await t.db.query.invoiceLines.findMany({ where: (l, { eq: e }) => e(l.invoiceId, credit) });
    await saveDraft(t.db, credit, { partnerId, reason: "Връщане" }, [{ ...line, quantity: 1 }]);
    await issueInvoice(t.db, credit, actor);
    const b = await createDraft(t.db, { kind: "invoice", partnerId, currency: "EUR", lines: [{ description: "Грешка", quantity: 1, unit: "бр.", unitPrice: 999 }] }, "Тест");
    await issueInvoice(t.db, b, actor);
    await cancelInvoice(t.db, b, "Грешен получател");

    const j = await salesJournal(t.db, today, today);
    expect(j.rows.map((r) => [r.kind, r.byRate[20].net, r.byRate[20].vat, r.gross])).toEqual([
      ["Фактура", 100, 20, 120],
      ["Кредитно известие", -50, -10, -60],
      ["Фактура", 0, 0, 0],
    ]);
    expect(j.rows[2].note).toContain("анулиран");
    expect([j.totals[20].net, j.vat, j.gross]).toEqual([50, 10, 60]);
    expect((await t.db.select().from(invoices).where(eq(invoices.id, b)))[0].status).toBe("cancelled");
  });

  it("доставки: приход по себестойност, връщане към доставчик с минус, продажбите не влизат", async () => {
    const item = await createItem(t.db);
    const ship = async (direction: "inbound" | "outbound", quantity: number, isReturn = false, unitCost?: number) => {
      const [{ id }] = await t.db.insert(shipments).values({ reference: `S-${Math.random().toString(36).slice(2, 7)}`, direction, locationId: t.main, isReturn, partnerId }).$returningId();
      await t.db.insert(shipmentLines).values({ shipmentId: id, itemId: item, quantity, unitCost });
      await changeShipmentStatus(t.db, actor, id, "delivered");
    };
    await ship("inbound", 10, false, 4);
    await ship("outbound", 3, true); // връщане към доставчик по 4
    await ship("outbound", 2); // продажба
    const today = localTodayIso();
    const p = await purchasesList(t.db, today, today);
    expect(p.rows.map((r) => r.value)).toEqual([40, -12]);
    expect(p.total).toBe(28);
  });
});
