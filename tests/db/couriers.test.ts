import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { integrationLogs, integrations, items, partners, shipmentLines, shipments } from "@/db/tenant-schema";
import { getIntegration, saveIntegration } from "@/lib/integrations/core";
import { COURIERS } from "@/lib/integrations/couriers";
import { createWaybill, syncCarrierStatuses, waybillLabel } from "@/lib/integrations/waybills";
import { setSetting } from "@/lib/settings";
import { applyMovement } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();
afterEach(() => vi.unstubAllGlobals());

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
type Call = { url: string; init: RequestInit };
/** fetch, който отговаря според пътя; записва заявките. */
function stub(routes: Array<[RegExp, (body: unknown) => unknown]>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = routes.find(([re]) => re.test(url));
    if (!r) return new Response("not found", { status: 404 });
    const out = r[1](init.body ? JSON.parse(String(init.body)) : null);
    return out instanceof Uint8Array ? new Response(new Uint8Array(out).buffer, { status: 200, headers: { "content-type": "application/pdf" } }) : new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

async function outboundShipment(qty = 2) {
  const item = await createItem(t.db);
  await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: item, locationId: t.main, type: "in", quantity: 10 }));
  const [{ id: partnerId }] = await t.db.insert(partners).values({ name: "Клиент Иван", phone: "0888111222", type: "customer" }).$returningId();
  const [{ id }] = await t.db.insert(shipments).values({ reference: `ПР-${Math.random().toString(36).slice(2, 7)}`, direction: "outbound", locationId: t.main, partnerId }).$returningId();
  await t.db.insert(shipmentLines).values({ shipmentId: id, itemId: item, quantity: qty });
  return { id, item };
}

beforeAll(async () => {
  t = await createTenant("courier");
  for (const [k, v] of Object.entries({ legalName: "Демо ЕООД", phone: "0888000000", mol: "Иван Петров" })) await setSetting(t.db, `company.${k}`, v);
  await saveIntegration(t.db, "econt", { enabled: true, credentials: { username: "iasp-dev", password: "1Asp-dev" }, settings: { demo: "да", senderOfficeCode: "1127" } });
  await saveIntegration(t.db, "speedy", { enabled: true, credentials: { username: "u", password: "p" }, settings: { serviceId: "505", payer: "RECIPIENT" } });
  await saveIntegration(t.db, "boxnow", { enabled: true, credentials: { clientId: "cid", clientSecret: "sec" }, settings: { baseUrl: "https://boxnow.test", originId: "2" } });
});

describe("интеграции: общи", () => {
  it("данните за достъп са криптирани; празна тайна оставя старата", async () => {
    const [row] = await t.db.select().from(integrations).where(eq(integrations.provider, "econt"));
    expect(row.credentialsEnc).not.toContain("1Asp-dev");
    await saveIntegration(t.db, "econt", { enabled: true, credentials: { username: "iasp-dev", password: "" }, settings: { demo: "да", senderOfficeCode: "1127" } });
    expect((await getIntegration(t.db, "econt")).credentials.password).toBe("1Asp-dev");
  });
});

describe("Еконт", () => {
  it("товарителница до офис с наложен платеж; BASIC; доставена → пратката се приключва и изписва", async () => {
    const { id, item } = await outboundShipment();
    const calls = stub([
      [/createLabel/, () => ({ label: { shipmentNumber: "1051600000001", pdfURL: "https://demo.econt.com/label.pdf", totalPrice: 6.01 } })],
      [/getShipmentStatuses/, () => ({ shipmentStatuses: [{ status: { shipmentNumber: "1051600000001", shortDeliveryStatus: "Доставена", shortDeliveryStatusEn: "Delivered", deliveryTime: 1792700000000, cdCollectedAmount: 25.5, cdCollectedTime: 1792700000000 } }] })],
    ]);
    const w = await createWaybill(t.db, id, { provider: "econt", officeCode: "2000", phone: "0888111222", weightKg: 1.5, parcels: 1, codAmount: 25.5 }, "EUR");
    expect(w).toMatchObject({ trackingNumber: "1051600000001", price: 6.01 });
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://demo.econt.com/ee/services/Shipments/LabelService.createLabel.json");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("iasp-dev:1Asp-dev").toString("base64")}`);
    expect(body).toMatchObject({ mode: "create", label: { senderOfficeCode: "1127", receiverOfficeCode: "2000", senderAgent: { name: "Иван Петров" }, services: { cdAmount: 25.5, cdType: "get", cdCurrency: "EUR" } } });
    expect(await waybillLabel(t.db, id)).toEqual({ url: "https://demo.econt.com/label.pdf" });

    const r = await syncCarrierStatuses(t.db, actor);
    expect(r).toMatchObject({ checked: 1, delivered: 1 });
    const [s] = await t.db.select().from(shipments).where(eq(shipments.id, id));
    expect(s).toMatchObject({ status: "delivered", carrierStatus: "Доставена", codCollectedAmount: 25.5 });
    expect((await t.db.select().from(items).where(eq(items.id, item)))[0].quantity).toBe(8);
    expect((await t.db.select().from(integrationLogs).where(eq(integrationLogs.provider, "econt"))).length).toBeGreaterThanOrEqual(2);
  });

  it("грешка на Еконт се показва с вътрешните съобщения", async () => {
    const { id } = await outboundShipment();
    stub([[/createLabel/, () => ({ type: "ExInvalidParam", message: " ", innerErrors: [{ type: "ExInvalidParam", message: "подател:", innerErrors: [{ message: "липсва телефон" }] }] })]]);
    await expect(createWaybill(t.db, id, { provider: "econt", officeCode: "2000", phone: "0888", weightKg: 1, parcels: 1 }, "EUR")).rejects.toThrow("подател: липсва телефон");
  });
});

describe("Спиди", () => {
  it("пратка до адрес (населено място по име), етикет по пакетите, −14 = доставена", async () => {
    const { id } = await outboundShipment();
    const calls = stub([
      [/location\/site/, () => ({ sites: [{ id: 68134 }] })],
      [/\/shipment$/, () => ({ id: "299999990", parcels: [{ id: "299999991", seqNo: 1 }], price: { total: 7.2 } })],
      [/\/print$/, () => new Uint8Array([37, 80, 68, 70])],
      [/\/track$/, () => ({ parcels: [{ parcelId: "299999990", operations: [{ dateTime: "2026-10-22T10:00:00+03:00", operationCode: -14, description: "Доставена" }] }] })],
    ]);
    const w = await createWaybill(t.db, id, { provider: "speedy", city: "София", postCode: "1000", street: "Витоша", num: "1", phone: "0888111222", weightKg: 2, parcels: 1, codAmount: 10 }, "EUR");
    expect(w).toMatchObject({ trackingNumber: "299999990", parcelIds: ["299999991"] });
    const create = JSON.parse(String(calls[1].init.body));
    expect(create).toMatchObject({ userName: "u", password: "p", recipient: { address: { siteId: 68134, streetName: "Витоша", streetNo: "1" }, privatePerson: true }, service: { serviceId: 505, additionalServices: { cod: { amount: 10 } } }, payment: { courierServicePayer: "RECIPIENT" } });
    const label = await waybillLabel(t.db, id);
    expect("pdf" in label && label.pdf?.subarray(0, 4).toString()).toBe("%PDF");
    expect(JSON.parse(String(calls[2].init.body)).parcels).toEqual([{ parcel: { id: "299999991" } }]);
    expect((await COURIERS.speedy.track(t.db, ["299999990"]))[0]).toMatchObject({ delivered: true, returned: false, status: "Доставена" });
  });
});

describe("BOX NOW", () => {
  it("вход с client credentials (токенът се преизползва), доставка само до автомат", async () => {
    const { id } = await outboundShipment();
    const calls = stub([
      [/auth-sessions/, () => ({ access_token: "tok", token_type: "Bearer", expires_in: 3600 })],
      [/delivery-requests/, () => ({ id: "42224", parcels: [{ id: "9219709201" }] })],
      [/destinations/, () => ({ data: [{ id: "9", name: "Автомат Лидл", addressLine1: "бул. България 1", postalCode: "1000" }] })],
    ]);
    await expect(createWaybill(t.db, id, { provider: "boxnow", city: "София", street: "х", phone: "1", weightKg: 1, parcels: 1 }, "EUR")).rejects.toThrow("само до автомат");
    const w = await createWaybill(t.db, id, { provider: "boxnow", officeCode: "9", phone: "+359888111222", weightKg: 1.2, parcels: 1, codAmount: 15 }, "EUR");
    expect(w.trackingNumber).toBe("9219709201");
    const req = JSON.parse(String(calls.find((c) => /delivery-requests/.test(c.url))!.init.body));
    expect(req).toMatchObject({ paymentMode: "cod", amountToBeCollected: "15.00", origin: { locationId: "2" }, destination: { locationId: "9" }, items: [{ weight: 1200 }] });
    const offices = await COURIERS.boxnow.offices(t.db);
    expect(offices[0]).toMatchObject({ code: "9", locker: true });
    expect(calls.filter((c) => /auth-sessions/.test(c.url))).toHaveLength(1);
  });
});
