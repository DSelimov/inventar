import "server-only";
import type { Db } from "@/db/tenant";
import { UserError } from "../../errors";
import { getIntegration, http, requireEnabled } from "../core";
import { date, type Courier, type CourierOffice, type TrackStatus } from "./types";

/**
 * Спиди (REST API v1, https://api.speedy.bg/api/docs/): потребител и парола във всяко тяло на заявка.
 * Публична демо среда няма — тестовете са със записани отговори; „Доставена“ е операция −14.
 */
const BASE = process.env.SPEEDY_API_URL || "https://api.speedy.bg/v1";
const DELIVERED = -14;
const RETURNED = [111, 124];
const BULGARIA = 100;

async function call(db: Db, action: string, path: string, body: Record<string, unknown>, binary = false) {
  const cfg = await requireEnabled(db, "speedy");
  if (!cfg.credentials.username || !cfg.credentials.password) throw new UserError("Попълнете потребител и парола за Спиди.");
  const res = await http(db, "speedy", action, `${BASE}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userName: cfg.credentials.username, password: cfg.credentials.password, language: "BG", ...body }),
    binary,
  });
  const b = res.body as { error?: { message?: string } } | null;
  if (res.status >= 400 || b?.error) throw new UserError(`Спиди: ${b?.error?.message ?? `HTTP ${res.status}`}`);
  return res;
}

async function siteId(db: Db, city: string, postCode?: string | null) {
  const res = await call(db, "findSite", "location/site", { countryId: BULGARIA, name: city, ...(postCode ? { postCode } : {}) });
  const sites = (res.body as { sites?: Array<{ id: number }> }).sites ?? [];
  if (!sites.length) throw new UserError(`Спиди не намира населено място „${city}“${postCode ? ` (${postCode})` : ""}.`);
  return sites[0].id;
}

export const speedy: Courier = {
  async createWaybill(db, input) {
    const cfg = await getIntegration(db, "speedy");
    const r = input.receiver;
    const recipient: Record<string, unknown> = {
      clientName: r.name,
      phone1: { number: r.phone },
      email: r.email ?? undefined,
      privatePerson: r.privatePerson,
      ...(r.officeCode
        ? { pickupOfficeId: Number(r.officeCode) }
        : { address: { countryId: BULGARIA, siteId: await siteId(db, r.city ?? "", r.postCode), streetName: r.street ?? undefined, streetNo: r.num ?? undefined, addressNote: r.other ?? undefined } }),
    };
    const res = await call(db, "createShipment", "shipment", {
      sender: { phone1: { number: input.sender.phone }, contactName: cfg.settings.contactName || input.sender.agentName || input.sender.name, ...(cfg.settings.dropoffOfficeId ? { dropoffOfficeId: Number(cfg.settings.dropoffOfficeId) } : {}) },
      recipient,
      service: {
        serviceId: Number(cfg.settings.serviceId) || 505,
        autoAdjustPickupDate: true,
        ...(input.codAmount ? { additionalServices: { cod: { amount: input.codAmount, processingType: "CASH" } } } : {}),
      },
      content: { parcelsCount: input.parcels, totalWeight: input.weightKg, contents: input.description.slice(0, 100), package: "BOX" },
      payment: { courierServicePayer: cfg.settings.payer || "RECIPIENT" },
      ref1: input.reference.slice(0, 30),
    });
    const b = res.body as { id?: string; parcels?: Array<{ id: string }>; price?: { total?: number } };
    if (!b.id) throw new UserError("Спиди не върна номер на пратката.");
    return { trackingNumber: b.id, labelUrl: null, parcelIds: (b.parcels ?? []).map((p) => p.id), price: b.price?.total ?? null };
  },

  async label(db, shipment) {
    const ids = shipment.parcelIds.length ? shipment.parcelIds : [shipment.trackingNumber];
    const res = await call(db, "print", "print", { paperSize: "A6", parcels: ids.map((id) => ({ parcel: { id } })) }, true);
    if (!res.bytes) throw new UserError("Спиди не върна етикет.");
    return res.bytes;
  },

  async track(db, numbers) {
    const out: TrackStatus[] = [];
    for (let i = 0; i < numbers.length; i += 10) {
      const res = await call(db, "track", "track", { parcels: numbers.slice(i, i + 10).map((id) => ({ id })) });
      const parcels = (res.body as { parcels?: Array<{ parcelId: string; operations?: Array<{ dateTime: string; operationCode: number; description: string }> }> }).parcels ?? [];
      for (const p of parcels) {
        const ops = p.operations ?? [];
        const last = ops[ops.length - 1];
        out.push({
          trackingNumber: p.parcelId,
          status: last?.description ?? "",
          at: date(last?.dateTime),
          delivered: ops.some((o) => o.operationCode === DELIVERED),
          returned: ops.some((o) => RETURNED.includes(o.operationCode)),
          codCollected: null,
          codCollectedAt: null,
          codPaidAt: null,
        });
      }
    }
    return out;
  },

  async offices(db) {
    const res = await call(db, "findOffice", "location/office", { countryId: BULGARIA });
    const offices = (res.body as { offices?: Array<{ id: number; name: string; type?: string; address?: { fullAddressString?: string; siteName?: string } }> }).offices ?? [];
    return offices.map((o): CourierOffice => ({ code: String(o.id), name: o.name, city: o.address?.siteName ?? "", address: o.address?.fullAddressString ?? "", locker: o.type === "APT" }));
  },
};
