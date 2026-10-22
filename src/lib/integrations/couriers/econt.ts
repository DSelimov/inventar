import "server-only";
import type { Db } from "@/db/tenant";
import { UserError } from "../../errors";
import { getIntegration, http, requireEnabled } from "../core";
import { date, type Courier, type CourierOffice, type TrackStatus } from "./types";

/**
 * Еконт (e-Econt JSON API, https://ee.econt.com/services/): BASIC автентикация; демо среда
 * demo.econt.com/ee/services с публичен достъп iasp-dev / 1Asp-dev. Проверено срещу демото.
 */
const base = (demo: boolean) => (demo ? "https://demo.econt.com/ee/services" : "https://ee.econt.com/services");
const isDemo = (v: string | undefined) => /^(да|yes|true|1)$/i.test(v ?? "");

async function call(db: Db, action: string, path: string, body: unknown) {
  const cfg = await requireEnabled(db, "econt");
  const demo = isDemo(cfg.settings.demo);
  const user = cfg.credentials.username || (demo ? "iasp-dev" : "");
  const pass = cfg.credentials.password || (demo ? "1Asp-dev" : "");
  if (!user || !pass) throw new UserError("Попълнете потребител и парола за Еконт.");
  const res = await http(db, "econt", action, `${base(demo)}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` },
    body: JSON.stringify(body),
  });
  const b = res.body as Record<string, unknown> | null;
  if (res.status >= 400 || (b && typeof b.type === "string" && b.type.startsWith("Ex"))) throw new UserError(`Еконт: ${econtError(b) || `HTTP ${res.status}`}`);
  return b ?? {};
}

/** Еконт връща грешките като дърво innerErrors — събираме съобщенията. */
function econtError(e: unknown): string {
  if (!e || typeof e !== "object") return "";
  const { message, innerErrors } = e as { message?: string; innerErrors?: unknown[] };
  const inner = (innerErrors ?? []).map(econtError).filter(Boolean).join("; ");
  return [message?.trim(), inner].filter(Boolean).join(" ");
}

export const econt: Courier = {
  async createWaybill(db, input) {
    const cfg = await getIntegration(db, "econt");
    const r = input.receiver;
    const label: Record<string, unknown> = {
      senderClient: { name: input.sender.name, phones: [input.sender.phone] },
      senderAgent: input.sender.agentName ? { name: input.sender.agentName, phones: [input.sender.phone] } : undefined,
      senderOfficeCode: cfg.settings.senderOfficeCode || undefined,
      receiverClient: { name: r.name, phones: [r.phone], email: r.email ?? undefined },
      receiverAgent: r.privatePerson ? undefined : { name: r.contactName || r.name, phones: [r.phone] },
      ...(r.officeCode
        ? { receiverOfficeCode: r.officeCode }
        : { receiverAddress: { city: { country: { code3: "BGR" }, name: r.city, postCode: r.postCode }, street: r.street, num: r.num, other: r.other } }),
      packCount: input.parcels,
      shipmentType: "pack",
      weight: input.weightKg,
      shipmentDescription: input.description,
      services: {
        ...(input.codAmount ? { cdAmount: input.codAmount, cdType: "get", cdCurrency: input.currency } : {}),
        ...(input.declaredValue ? { declaredValueAmount: input.declaredValue, declaredValueCurrency: input.currency } : {}),
      },
    };
    const b = (await call(db, "createLabel", "Shipments/LabelService.createLabel.json", { label, mode: "create" })) as { label?: { shipmentNumber?: string; pdfURL?: string; totalPrice?: number } };
    if (!b.label?.shipmentNumber) throw new UserError("Еконт не върна номер на товарителница.");
    return { trackingNumber: b.label.shipmentNumber, labelUrl: b.label.pdfURL || null, parcelIds: [], price: b.label.totalPrice ?? null };
  },

  async label() {
    throw new UserError("Етикетът на Еконт се отваря от адреса му (pdfURL).");
  },

  async track(db, numbers) {
    const b = (await call(db, "getShipmentStatuses", "Shipments/ShipmentService.getShipmentStatuses.json", { shipmentNumbers: numbers })) as {
      shipmentStatuses?: Array<{ status?: Record<string, unknown> | null; error?: unknown }>;
    };
    return (b.shipmentStatuses ?? []).flatMap((e, i): TrackStatus[] => {
      const s = e.status;
      if (!s) return [];
      const status = String(s.shortDeliveryStatus ?? "");
      const en = String(s.shortDeliveryStatusEn ?? "").toLowerCase();
      const cd = Number(s.cdCollectedAmount ?? 0);
      return [
        {
          trackingNumber: String(s.shipmentNumber ?? numbers[i]),
          status,
          at: date(s.deliveryTime) ?? date(s.sendTime) ?? null,
          delivered: Boolean(s.deliveryTime) && !en.includes("return"),
          returned: en.includes("return"),
          codCollected: cd > 0 ? cd : null,
          codCollectedAt: date(s.cdCollectedTime),
          codPaidAt: date(s.cdPaidTime),
        },
      ];
    });
  },

  async offices(db) {
    const b = (await call(db, "getOffices", "Nomenclatures/NomenclaturesService.getOffices.json", { countryCode: "BGR" })) as {
      offices?: Array<{ code: string; name: string; isAPS?: boolean; address?: { city?: { name?: string }; fullAddress?: string } }>;
    };
    return (b.offices ?? []).map((o): CourierOffice => ({ code: o.code, name: o.name, city: o.address?.city?.name ?? "", address: o.address?.fullAddress ?? "", locker: Boolean(o.isAPS) }));
  },
};
