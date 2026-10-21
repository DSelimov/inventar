"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Location, Order, OrderType } from "@/db/schema";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { Form } from "@/components/ui/form";
import type { ActionResult } from "@/lib/action";
import { PackQuantity, type PackOption } from "@/components/items/pack-quantity";
import { itemDecimals, mulQty, quantityStep } from "@/lib/quantity";
import { orderVat } from "@/lib/vat";

export type OrderItemOption = { id: number; name: string; sku: string; unit: string; quantity: number; variantLabel: string | null; unitCost: number; unitPrice: number; quantityDecimals: number; tracking: string; vatRateId: number | null };
export type VatRateOption = { id: number; name: string; rate: number; isDefault: boolean };
export type OrderPartnerOption = { id: number; name: string; type: string; leadTimeDays: number | null };
type Line = { key: number; itemId: string; quantity: string; price: string; vat: string; packId: string };

export function OrderForm({
  items,
  locations,
  partners,
  order,
  initialLines,
  initialType = "purchase",
  numberPlaceholder,
  vatRates,
  pricesIncludeVat,
  supplierPrices = [],
  initialPartnerId,
  packUnits = [],
  action,
  cancelHref,
}: {
  items: OrderItemOption[];
  locations: Location[];
  partners: OrderPartnerOption[];
  order?: Order;
  initialLines?: { itemId: number; quantity: number; unitPrice?: number; vatRateId?: number | null }[];
  initialType?: OrderType;
  numberPlaceholder: string;
  vatRates: VatRateOption[];
  /** Цени при доставчиците (поръчка за доставка): при избран доставчик се попълва неговата цена. */
  supplierPrices?: Array<{ itemId: number; partnerId: number; price: number | null }>;
  initialPartnerId?: number | null;
  packUnits?: PackOption[];
  /** Цените на редовете са с ДДС (за нова поръчка — от настройките, за съществуваща — от нея). */
  pricesIncludeVat: boolean;
  action: (fd: FormData) => Promise<ActionResult>;
  cancelHref: string;
}) {
  const [type, setType] = useState<OrderType>(order?.type ?? initialType);
  const [partnerId, setPartnerId] = useState<string>(order?.partnerId ? String(order.partnerId) : initialPartnerId ? String(initialPartnerId) : "");
  const priceFor = (itemId: string, t: OrderType, partner = partnerId) => {
    const it = items.find((i) => String(i.id) === itemId);
    if (!it) return "0";
    if (t !== "purchase") return String(it.unitPrice);
    const atSupplier = supplierPrices.find((p) => String(p.itemId) === itemId && String(p.partnerId) === partner)?.price;
    return String(atSupplier ?? it.unitCost);
  };
  const defaultVat = String(vatRates.find((r) => r.isDefault)?.id ?? vatRates[0]?.id ?? "");
  const vatFor = (itemId: string) => String(items.find((i) => String(i.id) === itemId)?.vatRateId ?? defaultVat);
  const [lines, setLines] = useState<Line[]>(() =>
    (initialLines?.length ? initialLines : [{ itemId: 0, quantity: 1 }]).map((l, i) => ({
      key: i,
      itemId: l.itemId ? String(l.itemId) : "",
      quantity: String(l.quantity),
      price: l.unitPrice !== undefined ? String(l.unitPrice) : l.itemId ? priceFor(String(l.itemId), order?.type ?? initialType) : "0",
      vat: l.vatRateId ? String(l.vatRateId) : l.itemId ? vatFor(String(l.itemId)) : defaultVat,
      packId: "",
    })),
  );
  const addLine = () => setLines((ls) => [...ls, { key: Date.now(), itemId: "", quantity: "1", price: "0", vat: defaultVat, packId: "" }]);
  const removeLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const stepFor = (itemId: string) => {
    const it = items.find((i) => String(i.id) === itemId);
    return quantityStep(it ? itemDecimals(it) : 0);
  };
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const purchase = type === "purchase";
  const partnerList = partners.filter((p) => p.type === "both" || p.type === (purchase ? "supplier" : "customer"));
  const baseQuantity = (l: Line) => {
    const q = Number(l.quantity.replace(",", ".")) || 0;
    const pack = packUnits.find((p) => String(p.id) === l.packId);
    return pack ? mulQty(q, pack.factor) : q;
  };
    const totals = orderVat(
    { pricesIncludeVat },
    lines.map((l) => ({ quantity: baseQuantity(l), unitPrice: Number(String(l.price).replace(",", ".")) || 0, vatRate: vatRates.find((r) => String(r.id) === l.vat)?.rate ?? 0 })),
  );

  return (
    <Form action={action} className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Поръчка</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Тип">
            <Select
              name="type"
              value={type}
              disabled={Boolean(order)}
              onChange={(e) => {
                const t = e.target.value as OrderType;
                setType(t);
                setLines((ls) => ls.map((l) => ({ ...l, price: l.itemId ? priceFor(l.itemId, t) : l.price })));
              }}
            >
              <option value="purchase">Поръчка за доставка (от доставчик)</option>
              <option value="sales">Клиентска поръчка (към клиент)</option>
            </Select>
            {order && <input type="hidden" name="type" value={order.type} />}
          </Field>
          <Field label="Номер" hint="Оставете празно за автоматичен.">
            <Input name="number" defaultValue={order?.number} placeholder={numberPlaceholder} />
          </Field>
          <Field label={purchase ? "Доставчик" : "Клиент"}>
            <Select
              name="partnerId"
              value={partnerId}
              onChange={(e) => {
                const p = e.target.value;
                setPartnerId(p);
                // доставчик с договорени цени: редовете вземат неговата цена
                if (type === "purchase") setLines((ls) => ls.map((l) => (l.itemId ? { ...l, price: priceFor(l.itemId, type, p) } : l)));
              }}
            >
              <option value="">— без партньор —</option>
              {partnerList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.leadTimeDays ? ` · ${p.leadTimeDays} дни доставка` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={purchase ? "Локация на получаване" : "Локация на изпращане"}>
            <Select name="locationId" defaultValue={order?.locationId ?? locations.find((l) => l.isDefault)?.id ?? ""}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Дата на поръчка">
            <Input name="orderDate" type="date" defaultValue={order?.orderDate ?? new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Очаквана дата">
            <Input name="expectedDate" type="date" defaultValue={order?.expectedDate ?? ""} />
          </Field>
          <Field label="Бележки" className="sm:col-span-2">
            <Textarea name="notes" defaultValue={order?.notes ?? ""} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Редове</h2>
          <span className="text-xs text-muted tabular-nums">
            Основа {totals.net.toFixed(2)} · ДДС {totals.vat.toFixed(2)} · Общо {totals.gross.toFixed(2)}
          </span>
        </div>
        <div className="space-y-2">
          {lines.map((line) => {
            const chosen = items.find((i) => String(i.id) === line.itemId);
            return (
              <div key={line.key} className="grid grid-cols-[1fr_6rem_7rem_8rem_2.5rem] items-start gap-2">
                <Select
                  name="lineItemId"
                  required
                  value={line.itemId}
                  onChange={(e) => update(line.key, { itemId: e.target.value, price: priceFor(e.target.value, type), vat: vatFor(e.target.value), packId: "" })}
                >
                  <option value="" disabled>
                    Изберете артикул…
                  </option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.variantLabel ? ` · ${i.variantLabel}` : ""} ({i.sku}) · {i.quantity} {i.unit}
                    </option>
                  ))}
                </Select>
                <PackQuantity
                  name="lineQuantity"
                  quantity={line.quantity}
                  packId={line.packId}
                  packs={packUnits.filter((p) => String(p.itemId) === line.itemId)}
                  unit={chosen?.unit ?? "бр."}
                  step={stepFor(line.itemId)}
                  onChange={(patch) => update(line.key, patch)}
                />
                <Input name="linePrice" type="number" min={0} step="0.01" value={line.price} onChange={(e) => update(line.key, { price: e.target.value })} aria-label={`Цена за ${chosen?.unit ?? "единица"}`} />
                <Select name="lineVatRateId" value={line.vat} onChange={(e) => update(line.key, { vat: e.target.value })} aria-label="ДДС">
                  {vatRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
                <Button variant="ghost" onClick={() => removeLine(line.key)} disabled={lines.length === 1} aria-label="Премахни реда">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-1 grid grid-cols-[1fr_6rem_7rem_8rem_2.5rem] gap-2 text-[11px] text-muted">
          <span>Артикул</span>
          <span>Количество</span>
          <span>Ед. цена {pricesIncludeVat ? "с ДДС" : "без ДДС"}</span>
          <span>ДДС</span>
          <span />
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={addLine}>
          <Plus className="h-4 w-4" />
          Добави ред
        </Button>
      </section>

      <FormActions>
        <ButtonLink href={cancelHref} variant="secondary">
          Отказ
        </ButtonLink>
        {order ? (
          <SubmitButton>Запази промените</SubmitButton>
        ) : (
          <>
            <SubmitButton variant="secondary" name="confirm" value="0">
              Запази като чернова
            </SubmitButton>
            <SubmitButton name="confirm" value="1">
              Потвърди поръчката
            </SubmitButton>
          </>
        )}
      </FormActions>
    </Form>
  );
}
