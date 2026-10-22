"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { int, optional, str } from "@/lib/forms";
import { assertIntegrationsAllowed, PROVIDERS, saveIntegration, type ProviderId } from "@/lib/integrations/core";
import { isCourier } from "@/lib/integrations/couriers";
import { courierOffices, createWaybill, syncCarrierStatuses } from "@/lib/integrations/waybills";
import { parseMoney } from "@/lib/money";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { formatMoney } from "@/lib/utils";

const provider = (v: string): ProviderId => {
  if (!(v in PROVIDERS)) throw new UserError("Непозната интеграция.");
  return v as ProviderId;
};

export const saveIntegrationAction = act(async (id: string, fd: FormData) => {
  const ctx = await requireContext("manage");
  await assertIntegrationsAllowed(ctx.org);
  const p = PROVIDERS[provider(id)];
  const credentials = Object.fromEntries(p.credentials.map((f) => [f.key, str(fd, `c_${f.key}`)]));
  const settings = Object.fromEntries(p.settings.map((f) => [f.key, str(fd, `s_${f.key}`)]));
  await saveIntegration(ctx.db, p.id, { enabled: fd.get("enabled") === "on", credentials, settings });
  await audit(ctx, "update", "settings", null, { integration: p.id, enabled: fd.get("enabled") === "on" });
  revalidatePath("/settings/integrations");
  return `${p.name}: настройките са запазени.`;
});

/** Проверка на връзката: заявка за списъка с офиси (куриери). */
export const testIntegrationAction = act(async (id: string) => {
  const ctx = await requireContext("manage");
  await assertIntegrationsAllowed(ctx.org);
  const p = provider(id);
  if (!isCourier(p)) throw new UserError("Проверката е за куриерите; магазините се проверяват със „Синхронизирай сега“.");
  const offices = await courierOffices(ctx.db, p, `${ctx.org.id}:test:${Date.now()}`);
  revalidatePath("/settings/integrations");
  return `${PROVIDERS[p].name}: връзката работи — ${offices.length} офиса/автомата.`;
});

export const createWaybillAction = act(async (shipmentId: number, fd: FormData) => {
  const ctx = await requireContext("write");
  await assertIntegrationsAllowed(ctx.org);
  const p = provider(str(fd, "provider"));
  if (!isCourier(p)) throw new UserError("Изберете куриер.");
  const office = str(fd, "officeCode").split(" ")[0]; // „1127 · София“ от списъка → кодът
  const w = await createWaybill(
    ctx.db,
    shipmentId,
    {
      provider: p,
      officeCode: office || null,
      city: optional(fd, "city"),
      postCode: optional(fd, "postCode"),
      street: optional(fd, "street"),
      num: optional(fd, "num"),
      other: optional(fd, "other"),
      phone: str(fd, "phone"),
      weightKg: Number(str(fd, "weight").replace(",", ".")) || 0,
      parcels: int(fd, "parcels", 1),
      codAmount: parseMoney(str(fd, "cod"), "Наложен платеж", null),
      description: optional(fd, "description"),
    },
    ctx.org.currency,
  );
  await audit(ctx, "update", "shipment", shipmentId, { waybill: w.trackingNumber, provider: p });
  revalidatePath(`/shipments/${shipmentId}`);
  return `Товарителница ${w.trackingNumber} е създадена${w.price !== null ? ` (доставка ${formatMoney(w.price, ctx.org.currency)})` : ""}.`;
});

export const syncCarriersAction = act(async () => {
  const ctx = await requireContext("write");
  await assertIntegrationsAllowed(ctx.org);
  const r = await syncCarrierStatuses(ctx.db, ctx.user);
  revalidatePath("/shipments");
  if (r.errors.length) throw new UserError(`Проверени ${r.checked}; грешки: ${r.errors.join("; ")}`);
  return `Проверени ${r.checked} товарителници: доставени ${r.delivered}, върнати ${r.returned}.`;
});
