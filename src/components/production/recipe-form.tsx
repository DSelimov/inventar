"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, FormActions, Input, Select, Textarea } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/action";
import { itemDecimals, quantityStep } from "@/lib/quantity";

export type RecipeItemOption = { id: number; name: string; sku: string; unit: string; quantityDecimals: number; tracking: string; variantLabel: string | null };
type Line = { key: number; itemId: string; quantity: string };

export function RecipeForm({
  items,
  recipe,
  initialItemId,
  action,
  cancelHref,
}: {
  items: RecipeItemOption[];
  recipe?: { itemId: number; name: string; outputQuantity: number; notes: string | null; active: boolean; lines: Array<{ itemId: number; quantity: number }> };
  initialItemId?: number;
  action: (fd: FormData) => Promise<ActionResult>;
  cancelHref: string;
}) {
  const [itemId, setItemId] = useState(String(recipe?.itemId ?? initialItemId ?? ""));
  const [lines, setLines] = useState<Line[]>(() => (recipe?.lines.length ? recipe.lines : [{ itemId: 0, quantity: 1 }]).map((l, i) => ({ key: i, itemId: l.itemId ? String(l.itemId) : "", quantity: String(l.quantity) })));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const find = (id: string) => items.find((i) => String(i.id) === id);
  const output = find(itemId);
  const label = (i: RecipeItemOption) => `${i.name}${i.variantLabel ? ` · ${i.variantLabel}` : ""} (${i.sku})`;

  return (
    <Form action={action} className="space-y-6">
      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Произвежда се" className="sm:col-span-2">
            <Select
              name="itemId"
              required
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
              }}
            >
              <option value="" disabled>
                Изберете артикул…
              </option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {label(i)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Име на рецептата">
            <Input name="name" required defaultValue={recipe?.name ?? ""} placeholder="напр. Торта шоколадова — 1 бр." />
          </Field>
          <Field label="Добив" hint={`Колко ${output?.unit ?? "бр."} излизат от количествата по-долу.`}>
            <Input name="outputQuantity" type="number" min={0} step={quantityStep(output ? itemDecimals(output) : 0)} defaultValue={recipe?.outputQuantity ?? 1} required />
          </Field>
          <Field label="Бележки" className="sm:col-span-2">
            <Textarea name="notes" defaultValue={recipe?.notes ?? ""} placeholder="Технология, време, температура…" />
          </Field>
          {recipe && (
            <div className="sm:col-span-2">
              <Checkbox name="active" value="1" defaultChecked={recipe.active} label="Активна" />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Съставки</h2>
        <p className="mb-4 text-xs text-muted">Вложените артикули за добива. При разглобяване се получават обратно в същото съотношение.</p>
        <div className="space-y-2">
          {lines.map((line) => {
            const it = find(line.itemId);
            return (
              <div key={line.key} className="grid grid-cols-[1fr_8rem_2.5rem] items-center gap-2">
                <Select name="lineItemId" required value={line.itemId} onChange={(e) => update(line.key, { itemId: e.target.value })} aria-label="Съставка">
                  <option value="" disabled>
                    Изберете съставка…
                  </option>
                  {items
                    .filter((i) => String(i.id) !== itemId)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {label(i)}
                      </option>
                    ))}
                </Select>
                <div className="flex items-center gap-1.5">
                  <Input name="lineQuantity" type="number" min={0} step={quantityStep(it ? itemDecimals(it) : 3)} value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} aria-label="Количество" required />
                  <span className="w-8 shrink-0 text-xs text-muted">{it?.unit}</span>
                </div>
                <Button variant="ghost" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== line.key) : ls))} disabled={lines.length === 1} aria-label="Премахни реда">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setLines((ls) => [...ls, { key: Date.now(), itemId: "", quantity: "1" }])}>
          <Plus className="h-4 w-4" /> Добави съставка
        </Button>
      </section>

      <FormActions>
        <ButtonLink href={cancelHref} variant="secondary">
          Отказ
        </ButtonLink>
        <SubmitButton>{recipe ? "Запази рецептата" : "Създай рецепта"}</SubmitButton>
      </FormActions>
    </Form>
  );
}
