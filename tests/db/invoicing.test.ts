import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { invoiceLines, invoices, orderLines, orders, partners, vatRates } from "@/db/tenant-schema";
import { addPayment, amountDue, cancelInvoice, createDraft, draftFromOrder, draftNoteFor, invoicedByOrderLine, issueInvoice, saveDraft } from "@/lib/invoicing";
import { setNextInvoiceNumber } from "@/lib/numbering";
import { setSetting } from "@/lib/settings";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { name: "Тест" };
let t: TestTenant;
let partnerId: number;
const inv = async (id: number) => (await t.db.select().from(invoices).where(eq(invoices.id, id)))[0];

beforeAll(async () => {
  t = await createTenant("inv");
  for (const [k, v] of Object.entries({ legalName: "Демо ЕООД", eik: "123456789", vatNumber: "BG123456789", address: "София, ул. Тест 1", mol: "Иван Иванов" })) await setSetting(t.db, `company.${k}`, v);
  [{ id: partnerId }] = await t.db.insert(partners).values({ name: "Клиент ООД", type: "customer", eik: "987654321", vatNumber: "BG987654321", vatRegistered: true, address: "Пловдив" }).$returningId();
});

describe("фактуриране", () => {
  it("чернова → издаване: десетразряден пореден номер, снимка на страните, суми по ставка; издадената не се променя", async () => {
    await setNextInvoiceNumber(t.db, 41);
    const item = await createItem(t.db, "none", { unit: "бр." });
    const id = await createDraft(t.db, { kind: "invoice", partnerId, currency: "EUR", lines: [{ itemId: item, description: "Мишка", quantity: 3, unit: "бр.", unitPrice: 9.99 }, { description: "Доставка", quantity: 1, unit: "услуга", unitPrice: 5 }] }, "Тест");
    expect((await inv(id)).number).toBeNull();
    const r = await issueInvoice(t.db, id, actor);
    expect(r.number).toBe("0000000041");
    const issued = await inv(id);
    expect(issued).toMatchObject({ status: "issued", supplierEik: "123456789", recipientName: "Клиент ООД", recipientVatNumber: "BG987654321", netTotal: 34.97, vatTotal: 6.99, grossTotal: 41.96 });
    expect(issued.taxEventDate).toBe(issued.issueDate);
    await expect(saveDraft(t.db, id, {}, [])).rejects.toThrow("не се променя");

    const second = await createDraft(t.db, { kind: "invoice", partnerId, currency: "EUR", lines: [{ description: "Услуга", quantity: 1, unit: "бр.", unitPrice: 10 }] }, "Тест");
    expect((await issueInvoice(t.db, second, actor)).number).toBe("0000000042");
  });

  it("проверки при издаване: адрес на получателя, основание при 0 %, известие без основание", async () => {
    const [{ id: noAddress }] = await t.db.insert(partners).values({ name: "Без адрес" }).$returningId();
    const a = await createDraft(t.db, { kind: "invoice", partnerId: noAddress, currency: "EUR", lines: [{ description: "X", quantity: 1, unit: "бр.", unitPrice: 1 }] }, "Тест");
    await expect(issueInvoice(t.db, a, actor)).rejects.toThrow("адреса");

    const zero = (await t.db.select().from(vatRates).where(eq(vatRates.rate, 0)))[0];
    await t.db.update(vatRates).set({ legalBasis: null }).where(eq(vatRates.id, zero.id));
    const b = await createDraft(t.db, { kind: "invoice", partnerId, currency: "EUR", lines: [{ description: "Износ", quantity: 1, unit: "бр.", unitPrice: 1, vatRateId: zero.id }] }, "Тест");
    await expect(issueInvoice(t.db, b, actor)).rejects.toThrow("основание");
    expect((await inv(b)).number).toBeNull(); // отказаното издаване не заема номер
  });

  it("по поръчка: доставеното минус фактурираното; кредитно известие намалява дължимото; плащания и анулиране", async () => {
    const item = await createItem(t.db);
    const [{ id: so }] = await t.db.insert(orders).values({ type: "sales", number: "ПР-1", status: "partial", partnerId }).$returningId();
    await t.db.insert(orderLines).values({ orderId: so, itemId: item, quantity: 10, fulfilledQuantity: 6, unitPrice: 10, vatRate: 20 });
    const id = await draftFromOrder(t.db, so, "EUR", "Тест");
    expect((await t.db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))).map((l) => l.quantity)).toEqual([6]);
    await issueInvoice(t.db, id, actor);
    expect([...(await invoicedByOrderLine(t.db, so)).values()]).toEqual([6]);
    await expect(draftFromOrder(t.db, so, "EUR", "Тест")).rejects.toThrow("вече е фактурирано");

    const credit = await draftNoteFor(t.db, id, "credit_note", "Тест");
    const [line] = await t.db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, credit));
    await saveDraft(t.db, credit, { partnerId, reason: "Върнати 2 бр." }, [{ ...line, quantity: 2 }]);
    await issueInvoice(t.db, credit, actor);
    expect(await amountDue(t.db, id)).toBe(48); // 72 − 24
    expect([...(await invoicedByOrderLine(t.db, so)).values()]).toEqual([4]);

    expect((await addPayment(t.db, id, { paidOn: "2026-10-21", amount: 20 }, "Тест")).status).toBe("partial");
    const paid = await addPayment(t.db, id, { paidOn: "2026-10-22", amount: 28 }, "Тест");
    expect(paid).toMatchObject({ status: "paid", becamePaid: true });

    await expect(cancelInvoice(t.db, credit, "")).rejects.toThrow("причина");
    await cancelInvoice(t.db, credit, "Грешка в количеството");
    expect(await inv(credit)).toMatchObject({ status: "cancelled", number: expect.stringMatching(/^\d{10}$/) });
  });

  it("паралелно издаване: различни поредни номера", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => createDraft(t.db, { kind: "invoice", partnerId, currency: "EUR", lines: [{ description: "Y", quantity: 1, unit: "бр.", unitPrice: 1 }] }, "Тест")));
    const numbers = (await Promise.all(ids.map((id) => issueInvoice(t.db, id, actor)))).map((r) => Number(r.number));
    expect(new Set(numbers).size).toBe(5);
    expect(Math.max(...numbers) - Math.min(...numbers)).toBe(4);
  });
});
