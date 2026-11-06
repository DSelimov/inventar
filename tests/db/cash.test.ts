import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cashEntries, invoicePayments, invoices, orderLines, orders, partners } from "@/db/tenant-schema";
import { accountBalances, openDocuments, partnerBalance, reverseCashEntry } from "@/lib/cash";
import { createDraft, draftFromOrder, issueInvoice } from "@/lib/invoicing";
import { payPartner } from "@/lib/partner-payments";
import { setSetting } from "@/lib/settings";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
let customer: number;
let supplier: number;
beforeAll(async () => {
  t = await createTenant("cash");
  for (const [k, v] of Object.entries({ legalName: "Демо ЕООД", eik: "123456789", vatNumber: "BG123456789", address: "София" })) await setSetting(t.db, `company.${k}`, v);
  [{ id: customer }] = await t.db.insert(partners).values({ name: "Клиент", type: "customer", address: "Пловдив" }).$returningId();
  [{ id: supplier }] = await t.db.insert(partners).values({ name: "Доставчик", type: "supplier" }).$returningId();
});

describe("каса и салда", () => {
  it("салдо: фактура + нефактурираната част от продажба; плащане по най-старите документи, остатъкът е аванс", async () => {
    const item = await createItem(t.db);
    // фактура за 120 (100 + 20 % ДДС)
    const inv = await createDraft(t.db, { kind: "invoice", partnerId: customer, currency: "EUR", lines: [{ description: "Услуга", quantity: 1, unit: "бр.", unitPrice: 100 }] }, "Тест");
    await issueInvoice(t.db, inv, actor);
    // продажба: доставени 5 × 10, фактурирани 3 → нефактурирани 2 × 10 × 1,2 = 24
    const [{ id: so }] = await t.db.insert(orders).values({ type: "sales", number: "ПР-1", status: "partial", partnerId: customer, orderDate: "2026-01-05" }).$returningId();
    const [{ id: line }] = await t.db.insert(orderLines).values({ orderId: so, itemId: item, quantity: 10, fulfilledQuantity: 5, unitPrice: 10, vatRate: 20 }).$returningId();
    await t.db.update(orderLines).set({ fulfilledQuantity: 3 }).where(eq(orderLines.id, line));
    const partial = await draftFromOrder(t.db, so, "EUR", "Тест");
    await issueInvoice(t.db, partial, actor); // 3 × 10 × 1,2 = 36
    await t.db.update(orderLines).set({ fulfilledQuantity: 5 }).where(eq(orderLines.id, line));

    expect(await partnerBalance(t.db, customer)).toMatchObject({ invoiced: 156, deliveredWithoutInvoice: 24, paidIn: 0, receivable: 180 });
    const docs = await openDocuments(t.db, customer, "in");
    expect(docs.map((d) => [d.kind, d.open])).toEqual([
      ["invoice", 120],
      ["invoice", 36],
      ["order", 24],
    ]);

    const alloc = await payPartner(t.db, actor, { partnerId: customer, direction: "in", amount: 190, date: "2026-02-01" });
    expect(alloc.map((a) => [a.kind, a.amount])).toEqual([
      ["invoice", 120],
      ["invoice", 36],
      ["order", 24],
      ["advance", 10],
    ]);
    expect((await t.db.select().from(invoices).where(eq(invoices.id, inv)))[0]).toMatchObject({ paymentStatus: "paid", paidAmount: 120 });
    expect(await t.db.select().from(invoicePayments)).toHaveLength(2);
    expect(await partnerBalance(t.db, customer)).toMatchObject({ paidIn: 190, receivable: -10 }); // аванс
    expect(await openDocuments(t.db, customer, "in")).toEqual([]);

    // касата по подразбиране: поредни ПКО, плащанията по фактури — с връзка към плащането
    const entries = await t.db.select().from(cashEntries).orderBy(cashEntries.id);
    expect(entries.map((e) => e.number)).toEqual(["ПКО-2026-001", "ПКО-2026-002", "ПКО-2026-003", "ПКО-2026-004"].map((n) => n.replace("2026", String(new Date().getFullYear()))));
    expect(entries.filter((e) => e.invoicePaymentId).length).toBe(2);
    expect(entries.find((e) => e.orderId === so)?.amount).toBe(24);
  });

  it("сторно: обратен запис с РКО, аванс изчезва от салдото; плащане по фактура не се сторнира", async () => {
    const advance = (await t.db.select().from(cashEntries)).find((e) => e.category === "Аванс от клиент")!;
    const r = await reverseCashEntry(t.db, actor, advance.id);
    expect(r.number).toMatch(/^РКО-\d{4}-001$/);
    expect(await partnerBalance(t.db, customer)).toMatchObject({ receivable: 0 });
    await expect(reverseCashEntry(t.db, actor, advance.id)).rejects.toThrow("вече е сторниран");
    const byInvoice = (await t.db.select().from(cashEntries)).find((e) => e.invoiceId)!;
    await expect(reverseCashEntry(t.db, actor, byInvoice.id)).rejects.toThrow("кредитно известие");
    const [cash] = await accountBalances(t.db);
    expect(cash).toMatchObject({ kind: "cash", inflow: 190, outflow: 10, balance: 180 });
  });

  it("доставчик: получената стока е задължение; плащане към него по банката — без номер", async () => {
    const item = await createItem(t.db);
    const [{ id: po }] = await t.db.insert(orders).values({ type: "purchase", number: "ПЗ-1", status: "completed", partnerId: supplier }).$returningId();
    await t.db.insert(orderLines).values({ orderId: po, itemId: item, quantity: 4, fulfilledQuantity: 4, unitPrice: 25, vatRate: 20 });
    expect(await partnerBalance(t.db, supplier)).toMatchObject({ receivedFromSupplier: 120, payable: 120 });
    const bank = (await accountBalances(t.db)).find((a) => a.kind === "bank")!;
    const alloc = await payPartner(t.db, actor, { partnerId: supplier, direction: "out", amount: 50, date: "2026-02-02", accountId: bank.id });
    expect(alloc).toEqual([{ kind: "order", id: po, number: "ПЗ-1", amount: 50 }]);
    expect(await partnerBalance(t.db, supplier)).toMatchObject({ paidOut: 50, payable: 70 });
    const entry = (await t.db.select().from(cashEntries).where(eq(cashEntries.orderId, po)))[0];
    expect(entry).toMatchObject({ number: null, direction: "out", accountId: bank.id });
  });
});
