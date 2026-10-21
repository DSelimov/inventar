"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Location } from "@/db/schema";
import type { ItemOption, LotOption } from "@/components/shipments/shipment-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/action";
import { itemDecimals, quantityStep } from "@/lib/quantity";

type Line = { key: number; itemId: string; quantity: string; lotId: string };

export function WriteOffForm({ items, locations, lots, initialItemId, action }: { items: ItemOption[]; locations: Location[]; lots: LotOption[]; initialItemId?: number; action: (fd: FormData) => Promise<ActionResult> }) {
  const [locationId, setLocationId] = useState(String(locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? ""));
  const [lines, setLines] = useState<Line[]>([{ key: 0, itemId: initialItemId ? String(initialItemId) : "", quantity: "1", lotId: "" }]);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const item = (id: string) => items.find((i) => String(i.id) === id);

  return (
    <Form action={action} className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Локация">
            <Select name="locationId" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Причина">
            <Input name="reason" required placeholder="Изтекъл срок, повреда при транспорт…" />
          </Field>
          <Field label="Комисия" hint="По един член на ред — подписват протокола.">
            <Textarea name="commission" className="min-h-20" placeholder={"Иван Петров — председател\nМария Георгиева"} />
          </Field>
          <Field label="Бележки">
            <Textarea name="notes" className="min-h-20" />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Стока за брак</h2>
        <div className="space-y-2">
          {lines.map((line) => {
            const chosen = item(line.itemId);
            const tracked = chosen && chosen.tracking !== "none";
            const step = quantityStep(chosen ? itemDecimals(chosen) : 0);
            const lineLots = chosen ? lots.filter((l) => l.itemId === chosen.id && String(l.locationId) === locationId) : [];
            return (
              <div key={line.key} className="grid grid-cols-[1fr_7rem_2.5rem] items-start gap-2">
                <div className="space-y-2">
                  <Select name="lineItemId" required value={line.itemId} onChange={(e) => update(line.key, { itemId: e.target.value, lotId: "" })}>
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
                  {tracked ? (
                    <Select name="lineLotId" required value={line.lotId} onChange={(e) => update(line.key, { lotId: e.target.value })}>
                      <option value="" disabled>
                        {lineLots.length ? "Партида / сериен номер…" : "Няма партиди в тази локация"}
                      </option>
                      {lineLots.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.lotNumber} · {l.quantity}
                          {l.expiryDate ? ` · до ${l.expiryDate}` : ""}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <input type="hidden" name="lineLotId" value="" />
                  )}
                </div>
                <Input name="lineQuantity" type="number" min={step} step={step} required value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} aria-label="Количество" />
                <Button variant="ghost" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== line.key) : ls))} disabled={lines.length === 1} aria-label="Премахни реда">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setLines((ls) => [...ls, { key: Date.now(), itemId: "", quantity: "1", lotId: "" }])}>
          <Plus className="h-4 w-4" /> Добави ред
        </Button>
      </section>

      <FormActions>
        <ButtonLink href="/write-offs" variant="secondary">
          Отказ
        </ButtonLink>
        <SubmitButton>Създай чернова</SubmitButton>
      </FormActions>
    </Form>
  );
}
