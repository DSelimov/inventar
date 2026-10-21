"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/action";
import { orderVat } from "@/lib/vat";

export type EditorItem = { id: number; name: string; variantLabel: string | null; sku: string; unit: string; unitPrice: number; vatRateId: number | null };
export type EditorVat = { id: number; name: string; rate: number; isDefault: boolean };
type Line = { key: number; itemId: string; orderLineId: string; description: string; quantity: string; unit: string; price: string; vat: string };

export function InvoiceEditor(props: {
  invoice: { kind: string; partnerId: number | null; issueDate: string | null; taxEventDate: string | null; dueDate: string | null; paymentMethod: string | null; notes: string | null; reason: string | null; pricesIncludeVat: boolean; currency: string };
  lines: Array<{ itemId: number | null; orderLineId: number | null; description: string; quantity: number; unit: string; unitPrice: number; vatRateId: number | null }>;
  partners: Array<{ id: number; name: string }>;
  items: EditorItem[];
  vatRates: EditorVat[];
  action: (fd: FormData) => Promise<ActionResult>;
}) {
  const { invoice } = props;
  const defaultVat = String(props.vatRates.find((r) => r.isDefault)?.id ?? props.vatRates[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    props.lines.map((l, i) => ({ key: i, itemId: l.itemId ? String(l.itemId) : "", orderLineId: l.orderLineId ? String(l.orderLineId) : "", description: l.description, quantity: String(l.quantity), unit: l.unit, price: String(l.unitPrice), vat: l.vatRateId ? String(l.vatRateId) : defaultVat })),
  );
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key: number, itemId: string) => {
    const it = props.items.find((i) => String(i.id) === itemId);
    update(key, it ? { itemId, description: it.variantLabel ? `${it.name} · ${it.variantLabel}` : it.name, unit: it.unit, price: String(it.unitPrice), vat: String(it.vatRateId ?? defaultVat) } : { itemId: "" });
  };
  const totals = orderVat(
    { pricesIncludeVat: invoice.pricesIncludeVat },
    lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPrice: Number(l.price.replace(",", ".")) || 0, vatRate: props.vatRates.find((r) => String(r.id) === l.vat)?.rate ?? 0 })),
  );
  const note = invoice.kind === "credit_note" || invoice.kind === "debit_note";

  return (
    <Form action={props.action} className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Получател" className="sm:col-span-3">
            <Select name="partnerId" defaultValue={invoice.partnerId ?? ""} required>
              <option value="" disabled>
                Изберете партньор…
              </option>
              {props.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Дата на издаване" hint="Празно = денят на издаване.">
            <Input name="issueDate" type="date" defaultValue={invoice.issueDate ?? ""} />
          </Field>
          {invoice.kind !== "proforma" && (
            <Field label="Дата на данъчно събитие" hint="Празно = датата на издаване.">
              <Input name="taxEventDate" type="date" defaultValue={invoice.taxEventDate ?? ""} />
            </Field>
          )}
          <Field label="Падеж">
            <Input name="dueDate" type="date" defaultValue={invoice.dueDate ?? ""} />
          </Field>
          <Field label="Начин на плащане">
            <Input name="paymentMethod" defaultValue={invoice.paymentMethod ?? ""} placeholder="Банков превод, в брой…" list="payment-methods" />
            <datalist id="payment-methods">
              <option value="Банков превод" />
              <option value="В брой" />
              <option value="С карта" />
              <option value="Наложен платеж" />
            </datalist>
          </Field>
          {note && (
            <Field label="Основание" className="sm:col-span-2">
              <Input name="reason" defaultValue={invoice.reason ?? ""} required placeholder="Връщане на стока, отстъпка…" />
            </Field>
          )}
          <Field label="Бележки" className="sm:col-span-3">
            <Textarea name="notes" defaultValue={invoice.notes ?? ""} className="min-h-16" />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Редове</h2>
          <span className="text-xs tabular-nums text-muted">
            Основа {totals.net.toFixed(2)} · ДДС {totals.vat.toFixed(2)} · Общо {totals.gross.toFixed(2)} {invoice.currency}
          </span>
        </div>
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="rounded-xl border border-line p-3">
              <input type="hidden" name="lineItemId" value={l.itemId} />
              <input type="hidden" name="lineOrderLineId" value={l.orderLineId} />
              <div className="grid gap-2 sm:grid-cols-[14rem_1fr_2.5rem]">
                <Select value={l.itemId} onChange={(e) => pickItem(l.key, e.target.value)} aria-label="Артикул">
                  <option value="">— свободен текст —</option>
                  {props.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.variantLabel ? ` · ${i.variantLabel}` : ""} ({i.sku})
                    </option>
                  ))}
                </Select>
                <Input name="lineDescription" value={l.description} required onChange={(e) => update(l.key, { description: e.target.value })} aria-label="Описание" placeholder="Описание на стоката или услугата" />
                <Button variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Премахни реда">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input name="lineQuantity" type="number" min="0.001" step="any" value={l.quantity} required onChange={(e) => update(l.key, { quantity: e.target.value })} aria-label="Количество" />
                <Input name="lineUnit" value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} aria-label="Мерна единица" />
                <Input name="linePrice" type="number" min={0} step="0.0001" value={l.price} required onChange={(e) => update(l.key, { price: e.target.value })} aria-label={invoice.pricesIncludeVat ? "Ед. цена с ДДС" : "Ед. цена без ДДС"} />
                <Select name="lineVatRateId" value={l.vat} onChange={(e) => update(l.key, { vat: e.target.value })} aria-label="ДДС">
                  {props.vatRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Количество · мерна единица · ед. цена {invoice.pricesIncludeVat ? "с ДДС" : "без ДДС"} · ставка ДДС</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setLines((ls) => [...ls, { key: Date.now(), itemId: "", orderLineId: "", description: "", quantity: "1", unit: "бр.", price: "0", vat: defaultVat }])}>
          <Plus className="h-4 w-4" /> Добави ред
        </Button>
      </section>

      <div className="flex justify-end">
        <SubmitButton>Запази черновата</SubmitButton>
      </div>
    </Form>
  );
}
