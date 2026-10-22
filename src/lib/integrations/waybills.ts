import "server-only";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { partners, shipments } from "@/db/tenant-schema";
import { UserError } from "../errors";
import { changeShipmentStatus } from "../shipment-service";
import type { Actor } from "../stock";
import { getCompanyDetails } from "../settings";
import { getIntegration, PROVIDERS } from "./core";
import { COURIERS, type CourierId } from "./couriers";
import { looksLikeCompany, type CourierOffice, type WaybillInput } from "./couriers/types";

/**
 * Товарителници от пратките: създаване при куриера, етикет, проследяване. При „доставена“ от куриера
 * пратката се отбелязва доставена (изписване от склада по себестойност); при върната — отказана.
 */

export type WaybillForm = { provider: CourierId; officeCode?: string | null; city?: string | null; postCode?: string | null; street?: string | null; num?: string | null; other?: string | null; phone: string; weightKg: number; parcels: number; codAmount?: number | null; description?: string | null };

export async function createWaybill(db: TenantDb, shipmentId: number, form: WaybillForm, currency: string) {
  const shipment = await db.query.shipments.findFirst({ where: eq(shipments.id, shipmentId), with: { partnerRecord: true } });
  if (!shipment) throw new UserError("Пратката не е намерена.");
  if (shipment.direction !== "outbound" || shipment.status === "delivered" || shipment.status === "cancelled") throw new UserError("Товарителница се създава за изходяща пратка, която още не е доставена.");
  if (shipment.trackingNumber && shipment.carrierProvider) throw new UserError(`Пратката вече има товарителница ${shipment.trackingNumber}.`);
  if (!(form.weightKg > 0)) throw new UserError("Въведете тегло.");
  if (!form.phone.trim()) throw new UserError("Въведете телефон на получателя.");
  if (!form.officeCode && !(form.city && form.street)) throw new UserError("Изберете офис/автомат или въведете адрес (град и улица).");

  const [company, cfg] = await Promise.all([getCompanyDetails(db), getIntegration(db, form.provider)]);
  const partner = shipment.partnerRecord ?? (shipment.partnerId ? await db.query.partners.findFirst({ where: eq(partners.id, shipment.partnerId) }) : null);
  const input: WaybillInput = {
    reference: shipment.reference,
    sender: { name: company.legalName || "Подател", phone: cfg.settings.senderPhone || company.phone, email: cfg.settings.senderEmail || null, agentName: cfg.settings.agentName || company.mol || null },
    receiver: {
      name: partner?.name ?? shipment.partner ?? "Получател",
      phone: form.phone.trim(),
      email: partner?.email ?? null,
      privatePerson: !looksLikeCompany(partner?.name ?? shipment.partner ?? "", partner?.eik),
      contactName: partner?.contactName ?? null,
      officeCode: form.officeCode || null,
      city: form.city,
      postCode: form.postCode,
      street: form.street,
      num: form.num,
      other: form.other,
    },
    weightKg: form.weightKg,
    parcels: Math.max(1, form.parcels),
    description: form.description || "Стоки",
    codAmount: form.codAmount || null,
    currency,
  };
  if (!input.sender.phone) throw new UserError("Попълнете телефон на подателя в настройките на интеграцията.");
  const w = await COURIERS[form.provider].createWaybill(db, input);
  await db
    .update(shipments)
    .set({ carrier: PROVIDERS[form.provider].name, carrierProvider: form.provider, trackingNumber: w.trackingNumber, carrierLabelUrl: w.labelUrl, carrierParcelIds: w.parcelIds, carrierStatus: "Създадена товарителница", carrierStatusAt: new Date(), codAmount: input.codAmount ?? null })
    .where(eq(shipments.id, shipmentId));
  return w;
}

export async function waybillLabel(db: Db, shipmentId: number) {
  const [s] = await db.select().from(shipments).where(eq(shipments.id, shipmentId));
  if (!s?.carrierProvider || !s.trackingNumber) throw new UserError("Пратката няма товарителница.");
  if (s.carrierLabelUrl) return { url: s.carrierLabelUrl };
  const pdf = await COURIERS[s.carrierProvider as CourierId].label(db, { trackingNumber: s.trackingNumber, parcelIds: s.carrierParcelIds ?? [] });
  return { pdf };
}

/** Обновява статусите на незавършените товарителници (последните 60 дни). */
export async function syncCarrierStatuses(db: TenantDb, actor: Actor) {
  const since = new Date(Date.now() - 60 * 86_400_000);
  const open = await db
    .select()
    .from(shipments)
    .where(and(isNotNull(shipments.carrierProvider), isNotNull(shipments.trackingNumber), inArray(shipments.status, ["pending", "in_transit"]), gte(shipments.createdAt, since)));
  const summary = { checked: 0, delivered: 0, returned: 0, errors: [] as string[] };
  for (const provider of Object.keys(COURIERS) as CourierId[]) {
    const mine = open.filter((s) => s.carrierProvider === provider);
    if (!mine.length) continue;
    const cfg = await getIntegration(db, provider);
    if (!cfg.enabled) continue;
    let statuses;
    try {
      statuses = await COURIERS[provider].track(db, mine.map((s) => s.trackingNumber!));
    } catch (e) {
      summary.errors.push(`${PROVIDERS[provider].name}: ${(e as Error).message}`);
      continue;
    }
    for (const st of statuses) {
      const s = mine.find((x) => x.trackingNumber === st.trackingNumber);
      if (!s) continue;
      summary.checked++;
      await db
        .update(shipments)
        .set({
          carrierStatus: st.status.slice(0, 200) || s.carrierStatus,
          carrierStatusAt: st.at ?? new Date(),
          ...(st.codCollected !== null ? { codCollectedAmount: st.codCollected, codCollectedAt: st.codCollectedAt } : {}),
          ...(st.codPaidAt ? { codPaidAt: st.codPaidAt } : {}),
        })
        .where(eq(shipments.id, s.id));
      try {
        if (st.delivered) {
          await changeShipmentStatus(db, actor, s.id, "delivered");
          summary.delivered++;
        } else if (st.returned) {
          await changeShipmentStatus(db, actor, s.id, "cancelled");
          summary.returned++;
        } else if (s.status === "pending" && st.status) {
          await changeShipmentStatus(db, actor, s.id, "in_transit");
        }
      } catch (e) {
        summary.errors.push(`${s.reference}: ${(e as Error).message}`);
      }
    }
  }
  return summary;
}

/** Офиси и автомати (кеш в паметта за 12 часа — списъците са големи и рядко се менят). */
const officeCache = new Map<string, { at: number; offices: CourierOffice[] }>();
export async function courierOffices(db: Db, provider: CourierId, cacheKey: string) {
  const key = `${cacheKey}:${provider}`;
  const hit = officeCache.get(key);
  if (hit && Date.now() - hit.at < 12 * 3600_000) return hit.offices;
  const offices = await COURIERS[provider].offices(db);
  officeCache.set(key, { at: Date.now(), offices });
  return offices;
}
