"use client";

import { useState } from "react";
import type { Category, FieldDefinition, Item, Location } from "@/db/schema";
import { Checkbox, Field, FormActions, Input, Select, Textarea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import type { ActionResult } from "@/lib/action";
import { quantityStep } from "@/lib/quantity";

type CategoryWithFields = Category & { fields: FieldDefinition[] };

export function ItemForm({
  categories,
  locations,
  item,
  values = {},
  action,
  cancelHref,
  defaultBarcode,
  vatRates,
}: {
  vatRates: Array<{ id: number; name: string }>;
  categories: CategoryWithFields[];
  locations: Location[];
  item?: Item;
  values?: Record<number, string>;
  action: (fd: FormData) => Promise<ActionResult>;
  cancelHref: string;
  defaultBarcode?: string;
}) {
  const [categoryId, setCategoryId] = useState<string>(item?.categoryId ? String(item.categoryId) : "");
  const [tracking, setTracking] = useState<string>(item?.tracking ?? "none");
  const [quantity, setQuantity] = useState<string>("0");
  const [decimals, setDecimals] = useState<number>(item?.quantityDecimals ?? 0);
  const step = quantityStep(tracking === "serial" ? 0 : decimals);
  const category = categories.find((c) => String(c.id) === categoryId);
  const trackingLocked = Boolean(item && item.quantity > 0);

  return (
    <Form action={action} className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Основни данни</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Име" className="sm:col-span-2">
            <Input name="name" required defaultValue={item?.name} placeholder="напр. Безжична мишка" autoFocus />
          </Field>
          {item?.parentId && (
            <Field label="Вариант" hint="Напр. размер / цвят.">
              <Input name="variantLabel" defaultValue={item.variantLabel ?? ""} />
            </Field>
          )}
          <Field label="Код (SKU)" hint="Оставете празно за автоматично генериране.">
            <Input name="sku" defaultValue={item?.sku} placeholder="MISHKA-001" className="font-mono" />
          </Field>
          <Field label="Баркод" hint="EAN / QR; използва се при сканиране.">
            <Input name="barcode" defaultValue={item?.barcode ?? defaultBarcode ?? ""} className="font-mono" inputMode="numeric" />
          </Field>
          <Field label="Категория">
            <Select name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Без категория —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Проследяване" hint={trackingLocked ? "Може да се смени само при нулева наличност." : "Партиди: срок на годност; серийни номера: всяка единица поотделно."}>
            <Select name="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} disabled={trackingLocked}>
              <option value="none">Без проследяване</option>
              <option value="lot">Партиди (с евентуален срок на годност)</option>
              <option value="serial">Серийни номера</option>
            </Select>
            {trackingLocked && <input type="hidden" name="tracking" value={item!.tracking} />}
          </Field>
          <Field label="Описание" className="sm:col-span-2">
            <Textarea name="description" defaultValue={item?.description ?? ""} placeholder="Незадължителни бележки за артикула" />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Наличност и цени</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!item && (
            <>
              <Field label="Начално количество">
                <Input name="quantity" type="number" min={0} step={step} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
              <Field label="Локация за началното количество">
                <Select name="locationId" defaultValue={locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? ""}>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {tracking !== "none" && Number(quantity) > 0 && (
                <>
                  <Field label={tracking === "serial" ? "Серийни номера" : "Партида №"} hint={tracking === "serial" ? "Разделени със запетая, колкото е количеството." : "Номер на партидата."}>
                    <Input name="lotNumber" required className="font-mono" />
                  </Field>
                  <Field label="Срок на годност">
                    <Input name="expiryDate" type="date" />
                  </Field>
                </>
              )}
            </>
          )}
          <Field label="Минимално количество" hint="Сигнал при достигане на това ниво. 0 изключва.">
            <Input name="minQuantity" type="number" min={0} step={step} defaultValue={item?.minQuantity ?? 0} />
          </Field>
          <Field label="Мерна единица">
            <Input name="unit" defaultValue={item?.unit ?? "бр."} placeholder="бр., кг, кашон…" />
          </Field>
          <Field label="Количества" hint={tracking === "serial" ? "Серийните номера са винаги цели бройки." : "Цели бройки или дробни за кг, л, м."}>
            <Select name="quantityDecimals" value={tracking === "serial" ? 0 : decimals} onChange={(e) => setDecimals(Number(e.target.value))} disabled={tracking === "serial"}>
              <option value={0}>Цели (1, 2, 3)</option>
              <option value={1}>1 знак (0,5)</option>
              <option value={2}>2 знака (0,25)</option>
              <option value={3}>3 знака (0,750)</option>
            </Select>
          </Field>
          <Field label="ДДС" hint="Празно = от категорията или ставката по подразбиране.">
            <Select name="vatRateId" defaultValue={item?.vatRateId ?? ""}>
              <option value="">{category?.vatRateId ? `От категорията (${vatRates.find((r) => r.id === category.vatRateId)?.name ?? "—"})` : "По подразбиране"}</option>
              {vatRates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Доставна цена" hint={item && item.quantity > 0 ? "Средна от доставките — изчислява се автоматично при всеки приход." : "Колко плащате за единица."}>
            <Input name="unitCost" type="number" min={0} step="0.0001" defaultValue={item?.unitCost ?? 0} readOnly={Boolean(item && item.quantity > 0)} />
          </Field>
          <Field label="Продажна цена" hint="На каква цена продавате (по избор).">
            <Input name="unitPrice" type="number" min={0} step="0.01" defaultValue={item?.unitPrice ?? 0} />
          </Field>
          {item && (
            <Field label="Статус">
              <Select name="status" defaultValue={item.status}>
                <option value="active">Активен</option>
                <option value="archived">Архивиран</option>
              </Select>
            </Field>
          )}
        </div>
      </section>

      {category && category.fields.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold">Данни за „{category.name}“</h2>
          <p className="mb-4 text-xs text-muted">Полета, дефинирани за тази категория.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {category.fields.map((f) => (
              <DynamicField key={f.id} field={f} value={values[f.id]} />
            ))}
          </div>
        </section>
      )}

      <FormActions>
        <ButtonLink href={cancelHref} variant="secondary">
          Отказ
        </ButtonLink>
        <SubmitButton>{item ? "Запази промените" : "Създай артикул"}</SubmitButton>
      </FormActions>
    </Form>
  );
}

function DynamicField({ field, value }: { field: FieldDefinition; value?: string }) {
  const name = `field_${field.id}`;
  const label = field.required ? `${field.name} *` : field.name;
  switch (field.type) {
    case "number":
      return (
        <Field label={label}>
          <Input name={name} type="number" step="any" defaultValue={value ?? ""} required={field.required} />
        </Field>
      );
    case "date":
      return (
        <Field label={label}>
          <Input name={name} type="date" defaultValue={value ?? ""} required={field.required} />
        </Field>
      );
    case "select": {
      const options: string[] = field.options ? (JSON.parse(field.options) as string[]) : [];
      return (
        <Field label={label}>
          <Select name={name} defaultValue={value ?? ""} required={field.required}>
            <option value="">— Изберете —</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </Field>
      );
    }
    case "boolean":
      return (
        <div className="flex items-end pb-2">
          <Checkbox name={name} label={field.name} defaultChecked={value === "true"} />
        </div>
      );
    default:
      return (
        <Field label={label}>
          <Input name={name} defaultValue={value ?? ""} required={field.required} />
        </Field>
      );
  }
}
