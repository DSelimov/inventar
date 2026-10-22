import type { Db } from "@/db/tenant";

/** Данни за товарителница — общи за всички куриери. */
export type WaybillInput = {
  reference: string;
  sender: { name: string; phone: string; email?: string | null; agentName?: string | null };
  receiver: {
    name: string;
    phone: string;
    email?: string | null;
    privatePerson: boolean;
    /** Лице за контакт / упълномощено лице при фирма (Еконт го изисква). */
    contactName?: string | null;
    /** Офис / автомат на куриера; иначе — адрес. */
    officeCode?: string | null;
    city?: string | null;
    postCode?: string | null;
    street?: string | null;
    num?: string | null;
    other?: string | null;
  };
  weightKg: number;
  parcels: number;
  description: string;
  codAmount?: number | null;
  declaredValue?: number | null;
  currency: string;
};

export type Waybill = { trackingNumber: string; labelUrl: string | null; parcelIds: string[]; price: number | null };
export type TrackStatus = { trackingNumber: string; status: string; at: Date | null; delivered: boolean; returned: boolean; codCollected: number | null; codCollectedAt: Date | null; codPaidAt: Date | null };
export type CourierOffice = { code: string; name: string; city: string; address: string; locker: boolean };

export interface Courier {
  createWaybill(db: Db, input: WaybillInput): Promise<Waybill>;
  /** PDF на етикета, ако куриерът не дава публичен адрес. */
  label(db: Db, shipment: { trackingNumber: string; parcelIds: string[] }): Promise<Buffer>;
  track(db: Db, trackingNumbers: string[]): Promise<TrackStatus[]>;
  offices(db: Db): Promise<CourierOffice[]>;
}

export const date = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Получател-фирма: по ЕИК или по правната форма в името (Еконт сам разпознава „ООД“ и др.). */
export const looksLikeCompany = (name: string, eik?: string | null) => Boolean(eik) || /(^|\s)(Е?ООД|Е?АД|ЕТ|СД|КД|КДА|ДЗЗД)(\s|$|,)/u.test(name.toUpperCase());
