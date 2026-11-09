import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { currencies, invoiceLines, items, orderLines, orders, partners, shipmentLines, shipments } from "@/db/tenant-schema";
import { partnerBalance } from "@/lib/cash";
import { readDocumentCurrency } from "@/lib/fx";
import { draftFromOrder } from "@/lib/invoicing";
import { changeShipmentStatus } from "@/lib/shipment-service";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("fx");
  await t.db.insert(currencies).values({ code: "USD", name: "Щатски долар", rate: 0.92 });
});

describe("поръчки в чужда валута", () => {
  it("доставка в USD: себестойността и задължението са в евро по курса на поръчката", async () => {
    const item = await createItem(t.db);
    const [{ id: sup }] = await t.db.insert(partners).values({ name: "US Supplier", type: "supplier", country: "US" }).$returningId();
    const fx = await readDocumentCurrency(t.db, "EUR", "usd", null);
    expect(fx).toEqual({ currency: "USD", exchangeRate: 0.92 });
    const [{ id: po }] = await t.db.insert(orders).values({ type: "purchase", number: "ПЗ-USD", status: "confirmed", partnerId: sup, locationId: t.main, ...fx }).$returningId();
    await t.db.insert(orderLines).values({ orderId: po, itemId: item, quantity: 10, unitPrice: 25, vatRate: 0 });
    const [{ id: sh }] = await t.db.insert(shipments).values({ reference: "S-USD", direction: "inbound", locationId: t.main, partnerId: sup, orderId: po }).$returningId();
    await t.db.insert(shipmentLines).values({ shipmentId: sh, itemId: item, quantity: 10 });
    await changeShipmentStatus(t.db, actor, sh, "delivered");
    expect((await t.db.query.items.findFirst({ where: eq(items.id, item) }))!.unitCost).toBe(23); // 25 USD × 0,92
    expect(await partnerBalance(t.db, sup)).toMatchObject({ receivedFromSupplier: 230, payable: 230 });
  });

  it("продажба в USD: фактурата е в евро по курса", async () => {
    const item = await createItem(t.db);
    const [{ id: cust }] = await t.db.insert(partners).values({ name: "US Customer", type: "customer", address: "NY" }).$returningId();
    const [{ id: so }] = await t.db.insert(orders).values({ type: "sales", number: "ПР-USD", status: "completed", partnerId: cust, currency: "USD", exchangeRate: 0.92 }).$returningId();
    await t.db.insert(orderLines).values({ orderId: so, itemId: item, quantity: 2, fulfilledQuantity: 2, unitPrice: 50, vatRate: 0 });
    expect((await partnerBalance(t.db, cust)).receivable).toBe(92);
    const inv = await draftFromOrder(t.db, so, "EUR", "Тест");
    const [line] = await t.db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv));
    expect(line.unitPrice).toBe(46);
  });

  it("непозната валута и основната валута", async () => {
    await expect(readDocumentCurrency(t.db, "EUR", "GBP", null)).rejects.toThrow("не е добавена");
    expect(await readDocumentCurrency(t.db, "EUR", "EUR", null)).toEqual({ currency: null, exchangeRate: null });
    expect(await readDocumentCurrency(t.db, "EUR", "USD", "0,9")).toEqual({ currency: "USD", exchangeRate: 0.9 });
  });
});
