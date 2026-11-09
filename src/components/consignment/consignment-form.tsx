"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/action";
import { itemDecimals, quantityStep } from "@/lib/quantity";

export type ConsignmentItemOption = { id: number; name: string; sku: string; unit: string; quantityDecimals: number; tracking: string; available: number; price?: number };
type Line = { key: number; itemId: string; quantity: string; price: string };

/** Редове за консигнация; available — наличното там, откъдето тръгва стоката. */
export function ConsignmentForm({
  kind,
  partnerId,
  warehouses,
  items,
  action,
  cancelHref,
}: {
  kind: "give" | "report" | "return";
  partnerId: number;
  warehouses: Array<{ id: number; name: string; isDefault: boolean }>;
  items: ConsignmentItemOption[];
  action: (fd: FormData) => Promise<ActionResult>;
  cancelHref: string;
}) {
  // при отчет и връщане — всичко на консигнация, готово за редакция
  const [lines, setLines] = useState<Line[]>(() =>
    kind === "give" ? [{ key: 0, itemId: "", quantity: "1", price: "" }] : items.map((i, n) => ({ key: n, itemId: String(i.id), quantity: String(i.available), price: i.price !== undefined ? String(i.price) : "" })),
  );
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const find = (id: string) => items.find((i) => String(i.id) === id);

  return (
    <Form action={action} className="space-y-6">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="partnerId" value={partnerId} />
      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {kind !== "report" && (
            <Field label={kind === "give" ? "От склад" : "Връща се в склад"}>
              <Select name="warehouseId" defaultValue={warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Бележка" className={kind === "report" ? "sm:col-span-2" : undefined}>
            <Textarea name="notes" className="min-h-10" />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Артикули</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">{kind === "give" ? "Няма артикули без партиди с наличност в склада." : "Партньорът няма стока на консигнация."}</p>
        ) : (
          <>
            <div className="space-y-2">
              {lines.map((line) => {
                const it = find(line.itemId);
                return (
                  <div key={line.key} className={kind === "report" ? "grid grid-cols-[1fr_7rem_7rem_2.5rem] items-center gap-2" : "grid grid-cols-[1fr_7rem_2.5rem] items-center gap-2"}>
                    <Select name="lineItemId" required value={line.itemId} onChange={(e) => update(line.key, { itemId: e.target.value, price: find(e.target.value)?.price !== undefined ? String(find(e.target.value)!.price) : "" })} aria-label="Артикул">
                      <option value="" disabled>
                        Изберете артикул…
                      </option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.sku}) · {i.available} {i.unit}
                        </option>
                      ))}
                    </Select>
                    <Input name="lineQuantity" type="number" min={0} max={it?.available} step={quantityStep(it ? itemDecimals(it) : 0)} value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} aria-label="Количество" />
                    {kind === "report" && <Input name="linePrice" type="number" min={0} step="0.0001" value={line.price} onChange={(e) => update(line.key, { price: e.target.value })} aria-label="Цена" placeholder="Цена" />}
                    <Button variant="ghost" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== line.key) : ls))} disabled={lines.length === 1} aria-label="Премахни реда">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
            {kind === "report" && <p className="mt-2 text-xs text-muted">Цената е по ценовата група и отстъпката на партньора; може да се промени. Нула продадени — махнете реда.</p>}
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setLines((ls) => [...ls, { key: Date.now(), itemId: "", quantity: "1", price: "" }])}>
              <Plus className="h-4 w-4" /> Добави ред
            </Button>
          </>
        )}
      </section>

      <FormActions>
        <ButtonLink href={cancelHref} variant="secondary">
          Отказ
        </ButtonLink>
        <SubmitButton disabled={items.length === 0}>{kind === "give" ? "Дай на консигнация" : kind === "report" ? "Запиши продаденото" : "Върни в склада"}</SubmitButton>
      </FormActions>
    </Form>
  );
}
