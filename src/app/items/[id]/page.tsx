import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Layers, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import { Badge, ColorBadge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { adjustStock, deleteItem } from "@/lib/actions/items";
import { getItem } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, formatMoney, formatNumber, isLowStock, label } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const item = await getItem(Number((await params).id));
  return { title: item?.name ?? "Артикул" };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [item, settings] = await Promise.all([getItem(id), getSettings()]);
  if (!item) notFound();

  const low = isLowStock(item);
  const values = new Map(item.fieldValues.map((v) => [v.fieldId, v.value]));
  const fields = item.category?.fields ?? [];

  return (
    <>
      <PageHeader
        back={{ href: "/items", label: "Артикули" }}
        eyebrow={<span className="font-mono normal-case">{item.sku}</span>}
        title={item.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {item.category && <ColorBadge color={item.category.color}>{item.category.name}</ColorBadge>}
            <Badge tone={statusTone[item.status]}>{label(item.status)}</Badge>
            {low && <Badge tone="danger">Ниска наличност</Badge>}
            {item.location && <span className="text-muted">{item.location}</span>}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/items/${id}/edit`} variant="secondary">
              <Pencil className="h-4 w-4" />
              Редакция
            </ButtonLink>
            <form action={deleteItem.bind(null, id)}>
              <ConfirmButton variant="danger" message={`Да изтрия ли „${item.name}“ заедно с цялата му складова история?`}>
                <Trash2 className="h-4 w-4" />
                Изтрий
              </ConfirmButton>
            </form>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Наличност" value={`${formatNumber(item.quantity)} ${item.unit}`} tone={low ? "danger" : undefined} />
        <Stat label="Минимум" value={item.minQuantity > 0 ? `${formatNumber(item.minQuantity)} ${item.unit}` : "—"} />
        <Stat label="Стойност на склад" value={formatMoney(item.quantity * item.unitCost, settings.currency)} hint={`${formatMoney(item.unitCost, settings.currency)} / ${item.unit}`} />
        <Stat label="Продажна стойност" value={formatMoney(item.quantity * item.unitPrice, settings.currency)} hint={`${formatMoney(item.unitPrice, settings.currency)} / ${item.unit}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Складова история" description="Най-новите движения са най-отгоре." />
            {item.movements.length === 0 ? (
              <CardBody className="text-sm text-muted">Все още няма движения.</CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Кога</th>
                    <th>Тип</th>
                    <th className="text-right">Промяна</th>
                    <th className="text-right">След</th>
                    <th>Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {item.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-muted">{formatDateTime(m.createdAt)}</td>
                      <td>
                        <Badge tone={statusTone[m.type]}>{label(m.type)}</Badge>
                      </td>
                      <td className={`text-right font-medium tabular-nums ${m.delta < 0 ? "text-danger" : "text-success"}`}>
                        {m.delta > 0 ? "+" : ""}
                        {formatNumber(m.delta)}
                      </td>
                      <td className="text-right tabular-nums">{formatNumber(m.quantityAfter)}</td>
                      <td className="text-muted">
                        {m.shipment ? (
                          <Link href={`/shipments/${m.shipment.id}`} className="hover:text-accent">
                            {m.reason ?? m.shipment.reference}
                          </Link>
                        ) : (
                          (m.reason ?? "—")
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {(item.description || fields.length > 0) && (
            <Card>
              <CardHeader title="Детайли" />
              <CardBody className="space-y-4">
                {item.description && <p className="whitespace-pre-line text-sm">{item.description}</p>}
                {fields.length > 0 && (
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {fields.map((f) => (
                      <div key={f.id}>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted">{f.name}</dt>
                        <dd className="mt-0.5 text-sm">{renderValue(f.type, values.get(f.id))}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Корекция на наличност" description="Запишете приход, разход или точно преброено количество." />
            <CardBody>
              <form action={adjustStock.bind(null, id)} className="space-y-3">
                <Field label="Тип">
                  <Select name="type" defaultValue="in">
                    <option value="in">Приход (+)</option>
                    <option value="out">Разход (−)</option>
                    <option value="adjust">Задай точно количество</option>
                  </Select>
                </Field>
                <Field label="Количество">
                  <Input name="quantity" type="number" min={0} step={1} required placeholder="0" />
                </Field>
                <Field label="Причина">
                  <Input name="reason" placeholder="Инвентаризация, брак, продажба…" />
                </Field>
                <SubmitButton className="w-full">
                  <SlidersHorizontal className="h-4 w-4" />
                  Приложи
                </SubmitButton>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Колекции" />
            <CardBody>
              {item.collectionItems.length === 0 ? (
                <p className="text-sm text-muted">Не е част от колекция.</p>
              ) : (
                <ul className="space-y-2">
                  {item.collectionItems.map((ci) => (
                    <li key={ci.collectionId}>
                      <Link href={`/collections/${ci.collectionId}`} className="flex items-center gap-2 text-sm hover:text-accent">
                        <Layers className="h-4 w-4 text-muted" />
                        <ColorBadge color={ci.collection.color}>{ci.collection.name}</ColorBadge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Бързи действия" />
            <CardBody className="flex flex-col gap-2">
              <ButtonLink href={`/shipments/new?direction=inbound&item=${id}`} variant="secondary" size="sm">
                <ArrowDownToLine className="h-4 w-4" />
                Получи чрез пратка
              </ButtonLink>
              <ButtonLink href={`/shipments/new?direction=outbound&item=${id}`} variant="secondary" size="sm">
                <ArrowUpFromLine className="h-4 w-4" />
                Изпрати
              </ButtonLink>
            </CardBody>
          </Card>

          <p className="text-xs text-muted">
            Създаден {formatDate(item.createdAt)} · Обновен {formatDate(item.updatedAt)}
          </p>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function renderValue(type: string, value?: string) {
  if (value === undefined || value === "") return <span className="text-muted">—</span>;
  if (type === "boolean") return value === "true" ? "Да" : "Не";
  if (type === "date") return formatDate(value);
  return value;
}
