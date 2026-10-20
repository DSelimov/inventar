"use client";

import { useState } from "react";
import type { Category, FieldDefinition, Item } from "@/db/schema";
import { Checkbox, Field, FormActions, Input, Select, Textarea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";

type CategoryWithFields = Category & { fields: FieldDefinition[] };

export function ItemForm({
  categories,
  item,
  values = {},
  action,
  cancelHref,
}: {
  categories: CategoryWithFields[];
  item?: Item;
  values?: Record<number, string>;
  action: (fd: FormData) => Promise<void>;
  cancelHref: string;
}) {
  const [categoryId, setCategoryId] = useState<string>(item?.categoryId ? String(item.categoryId) : "");
  const category = categories.find((c) => String(c.id) === categoryId);

  return (
    <form action={action} className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Основни данни</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Име" className="sm:col-span-2">
            <Input name="name" required defaultValue={item?.name} placeholder="напр. Безжична мишка" autoFocus />
          </Field>
          <Field label="Код (SKU)" hint="Оставете празно за автоматично генериране.">
            <Input name="sku" defaultValue={item?.sku} placeholder="MISHKA-001" className="font-mono" />
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
          <Field label="Описание" className="sm:col-span-2">
            <Textarea name="description" defaultValue={item?.description ?? ""} placeholder="Незадължителни бележки за артикула" />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Наличност и цени</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!item && (
            <Field label="Начално количество">
              <Input name="quantity" type="number" min={0} step={1} defaultValue={0} />
            </Field>
          )}
          <Field label="Минимално количество" hint="Сигнал при достигане на това ниво. 0 изключва.">
            <Input name="minQuantity" type="number" min={0} step={1} defaultValue={item?.minQuantity ?? 0} />
          </Field>
          <Field label="Мерна единица">
            <Input name="unit" defaultValue={item?.unit ?? "бр."} placeholder="бр., кг, кашон…" />
          </Field>
          <Field label="Доставна цена" hint="Колко плащате за единица.">
            <Input name="unitCost" type="number" min={0} step="0.01" defaultValue={item?.unitCost ?? 0} />
          </Field>
          <Field label="Продажна цена" hint="На каква цена продавате (по избор).">
            <Input name="unitPrice" type="number" min={0} step="0.01" defaultValue={item?.unitPrice ?? 0} />
          </Field>
          <Field label="Локация">
            <Input name="location" defaultValue={item?.location ?? ""} placeholder="Склад А · Рафт 3" />
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
    </form>
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
