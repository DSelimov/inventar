import "server-only";
import type { Db } from "@/db/tenant";
import { UserError } from "../../errors";
import { getIntegration, http, requireEnabled } from "../core";
import { date, type Courier, type CourierOffice, type TrackStatus } from "./types";

/**
 * BOX NOW (Partner API, https://www.boxnow.bg/en/diy/eshops/api): OAuth client credentials →
 * Bearer токен (3600 с); адресът на API (stage/production) се дава от BOX NOW. Доставката е само до
 * автомат (destination locationId). Наименованията на състоянията и стойността за наложен платеж да
 * се потвърдят в stage средата при подключване.
 */
const tokens = new Map<string, { token: string; until: number }>();

async function auth(db: Db) {
  const cfg = await requireEnabled(db, "boxnow");
  const baseUrl = (cfg.settings.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl || !cfg.credentials.clientId || !cfg.credentials.clientSecret) throw new UserError("Попълнете адрес на API, Client ID и Client secret за BOX NOW.");
  const key = `${baseUrl}|${cfg.credentials.clientId}`;
  const hit = tokens.get(key);
  if (hit && hit.until > Date.now() + 60_000) return { baseUrl, token: hit.token, cfg };
  const res = await http(db, "boxnow", "auth", `${baseUrl}/api/v1/auth-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: cfg.credentials.clientId, client_secret: cfg.credentials.clientSecret }),
  });
  const b = res.body as { access_token?: string; expires_in?: number } | null;
  if (res.status >= 400 || !b?.access_token) throw new UserError(`BOX NOW: неуспешен вход (HTTP ${res.status}).`);
  tokens.set(key, { token: b.access_token, until: Date.now() + (b.expires_in ?? 3600) * 1000 });
  return { baseUrl, token: b.access_token, cfg };
}

async function call(db: Db, action: string, path: string, init: RequestInit & { binary?: boolean } = {}) {
  const { baseUrl, token } = await auth(db);
  const res = await http(db, "boxnow", action, `${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (res.status >= 400) {
    const b = res.body as { message?: string; code?: string } | null;
    throw new UserError(`BOX NOW: ${b?.message ?? b?.code ?? `HTTP ${res.status}`}`);
  }
  return res;
}

const DELIVERED = ["delivered"];
const RETURNED = ["returned", "expired"];

export const boxnow: Courier = {
  async createWaybill(db, input) {
    const cfg = await getIntegration(db, "boxnow");
    if (!input.receiver.officeCode) throw new UserError("BOX NOW доставя само до автомат — изберете автомат.");
    const res = await call(db, "createDelivery", "/api/v1/delivery-requests", {
      method: "POST",
      body: JSON.stringify({
        orderNumber: input.reference,
        invoiceValue: (input.declaredValue ?? input.codAmount ?? 0).toFixed(2),
        paymentMode: input.codAmount ? "cod" : "prepaid",
        amountToBeCollected: (input.codAmount ?? 0).toFixed(2),
        allowReturn: true,
        origin: { contactName: input.sender.name, contactNumber: input.sender.phone, contactEmail: input.sender.email ?? cfg.settings.senderEmail ?? "", locationId: cfg.settings.originId },
        destination: { contactName: input.receiver.name, contactNumber: input.receiver.phone, contactEmail: input.receiver.email ?? "", locationId: input.receiver.officeCode },
        items: Array.from({ length: input.parcels }, (_, i) => ({ id: String(i + 1), name: input.description.slice(0, 50), value: "0.00", weight: Math.round((input.weightKg / input.parcels) * 1000), compartmentSize: 2 })),
      }),
    });
    const b = res.body as { id?: string; referenceNumber?: string; parcels?: Array<{ id: string }> };
    const parcelIds = (b.parcels ?? []).map((p) => p.id);
    if (!parcelIds.length) throw new UserError("BOX NOW не върна номер на пратката.");
    return { trackingNumber: parcelIds[0], labelUrl: null, parcelIds, price: null };
  },

  async label(db, shipment) {
    const res = await call(db, "label", `/api/v1/parcels/${encodeURIComponent(shipment.parcelIds[0] ?? shipment.trackingNumber)}/label.pdf`, { method: "GET", headers: { accept: "application/pdf" }, binary: true });
    if (!res.bytes) throw new UserError("BOX NOW не върна етикет.");
    return res.bytes;
  },

  async track(db, numbers) {
    const out: TrackStatus[] = [];
    for (const n of numbers) {
      const res = await call(db, "parcel", `/api/v1/parcels?parcelId=${encodeURIComponent(n)}`, { method: "GET" });
      const rows = (res.body as { data?: Array<{ id: string; state?: string; updatedAt?: string }> }).data ?? [];
      const p = rows.find((x) => x.id === n) ?? rows[0];
      if (!p) continue;
      const state = (p.state ?? "").toLowerCase();
      out.push({ trackingNumber: n, status: p.state ?? "", at: date(p.updatedAt), delivered: DELIVERED.includes(state), returned: RETURNED.includes(state), codCollected: null, codCollectedAt: null, codPaidAt: null });
    }
    return out;
  },

  async offices(db) {
    const res = await call(db, "destinations", "/api/v1/destinations?locationType=apm", { method: "GET" });
    const rows = (res.body as { data?: Array<{ id: string | number; name?: string; title?: string; addressLine1?: string; postalCode?: string; region?: string }> }).data ?? [];
    return rows.map((d): CourierOffice => ({ code: String(d.id), name: d.name ?? d.title ?? String(d.id), city: d.region ?? "", address: [d.addressLine1, d.postalCode].filter(Boolean).join(", "), locker: true }));
  },
};
