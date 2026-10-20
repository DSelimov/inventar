import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, GitBranch, Layers, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { ItemGallery } from "@/components/items/item-gallery";
import { Badge, ColorBadge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { adjustStock, createVariant, deleteItem, transfer } from "@/lib/actions/items";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { imageUrl, listItemImages, MAX_IMAGES_PER_ITEM } from "@/lib/item-images";
import { getItem, listLocations } from "@/lib/queries";
import { daysBetween, formatDate, formatDateTime, formatMoney, formatNumber, isLowStock, label, todayIso } from "@/lib/utils";
import { Form } from "@/components/ui/form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const item = await getItem(ctx.db, Number((await params).id));
  return { title: item?.name ?? "Артикул" };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [item, locations, ownImages] = await Promise.all([getItem(ctx.db, id), listLocations(ctx.db), listItemImages(ctx.db, id)]);
  if (!item) notFound();
  const images = ownImages.length || !item.parentId ? ownImages : await listItemImages(ctx.db, item.parentId);

  const currency = ctx.org.currency;
  const writable = can(ctx.role, "write");
  const low = isLowStock(item);
  const values = new Map(item.fieldValues.map((v) => [v.fieldId, v.value]));
  const fields = item.category?.fields ?? [];
  const tracked = item.tracking !== "none";
  const today = todayIso();
  const defaultLoc = locations.find((l) => l.isDefault) ?? locations[0];
  const title = item.variantLabel ? `${item.name} · ${item.variantLabel}` : item.name;

  return (
    <>
      <PageHeader
        back={item.parent ? { href: `/items/${item.parent.id}`, label: item.parent.name } : { href: "/items", label: "Артикули" }}
        eyebrow={
          <span className="font-mono normal-case">
            {item.sku}
            {item.barcode && <span className="ml-3 text-muted">▮ {item.barcode}</span>}
          </span>
        }
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {item.category && <ColorBadge color={item.category.color}>{item.category.name}</ColorBadge>}
            <Badge tone={statusTone[item.status]}>{label(item.status)}</Badge>
            {tracked && <Badge tone="info">{label(item.tracking)}</Badge>}
            {low && <Badge tone="danger">Ниска наличност</Badge>}
            {item.parent && <Badge tone="accent">Вариант на {item.parent.name}</Badge>}
          </span>
        }
        actions={
          writable && (
            <>
              <ButtonLink href={`/items/${id}/edit`} variant="secondary">
                <Pencil className="h-4 w-4" />
                Редакция
              </ButtonLink>
              {can(ctx.role, "delete") && (
                <Form action={deleteItem.bind(null, id)}>
                  <ConfirmButton variant="danger" message={`Да изтрия ли „${title}“ заедно с цялата му складова история?`}>
                    <Trash2 className="h-4 w-4" />
                    Изтрий
                  </ConfirmButton>
                </Form>
              )}
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Обща наличност" value={`${formatNumber(item.quantity)} ${item.unit}`} tone={low ? "danger" : undefined} />
        <Stat label="Минимум" value={item.minQuantity > 0 ? `${formatNumber(item.minQuantity)} ${item.unit}` : "—"} />
        <Stat label="Стойност на склад" value={formatMoney(item.quantity * item.unitCost, currency)} hint={`${formatMoney(item.unitCost, currency)} / ${item.unit}`} />
        <Stat label="Продажна стойност" value={formatMoney(item.quantity * item.unitPrice, currency)} hint={`${formatMoney(item.unitPrice, currency)} / ${item.unit}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Наличност по локации" />
            <Table>
              <thead>
                <tr>
                  <th>Локация</th>
                  <th className="text-right">Количество</th>
                  <th className="text-right">Стойност</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => {
                  const lvl = item.stockLevels.find((s) => s.locationId === l.id);
                  return (
                    <tr key={l.id}>
                      <td className="font-medium">
                        {l.name} {l.isDefault && <span className="text-xs text-muted">(по подразбиране)</span>}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatNumber(lvl?.quantity ?? 0)} {item.unit}
                      </td>
                      <td className="text-right tabular-nums text-muted">{formatMoney((lvl?.quantity ?? 0) * item.unitCost, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          {tracked && (
            <Card>
              <CardHeader title={item.tracking === "serial" ? "Серийни номера в наличност" : "Партиди в наличност"} description="Подредени по срок на годност (FEFO)." />
              {item.lots.length === 0 ? (
                <CardBody className="text-sm text-muted">Няма налични партиди.</CardBody>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>{item.tracking === "serial" ? "Сериен №" : "Партида"}</th>
                      <th>Локация</th>
                      <th>Срок на годност</th>
                      <th className="text-right">Количество</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.lots.map((l) => {
                      const days = l.expiryDate ? daysBetween(new Date(today), new Date(l.expiryDate)) : null;
                      return (
                        <tr key={l.id}>
                          <td className="font-mono text-xs">{l.lotNumber}</td>
                          <td>{l.location.name}</td>
                          <td>
                            {l.expiryDate ? (
                              <span className={days !== null && days < 0 ? "text-danger" : days !== null && days <= 30 ? "text-warning" : ""}>
                                {formatDate(l.expiryDate)}
                                {days !== null && days < 0 && " · изтекъл"}
                                {days !== null && days >= 0 && days <= 30 && ` · ${days} дни`}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="text-right tabular-nums">{formatNumber(l.quantity)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card>
          )}

          {!item.parentId && (
            <Card>
              <CardHeader title="Варианти" description="Размери, цветове или други разновидности със собствен код и наличност." />
              {item.variants.length > 0 && (
                <Table>
                  <thead>
                    <tr>
                      <th>Вариант</th>
                      <th>Код</th>
                      <th className="text-right">Наличност</th>
                      <th className="text-right">Продажна цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.variants.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <Link href={`/items/${v.id}`} className="font-medium hover:text-accent">
                            {v.variantLabel}
                          </Link>
                        </td>
                        <td className="font-mono text-xs text-muted">{v.sku}</td>
                        <td className="text-right tabular-nums">
                          {formatNumber(v.quantity)} {v.unit}
                        </td>
                        <td className="text-right tabular-nums">{formatMoney(v.unitPrice, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {writable && (
                <CardBody className={item.variants.length ? "border-t border-line" : ""}>
                  <Form action={createVariant.bind(null, id)} className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_8rem_auto]">
                    <Field label="Вариант">
                      <Input name="variantLabel" required placeholder="напр. L / Черен" />
                    </Field>
                    <Field label="Код (по избор)">
                      <Input name="sku" className="font-mono" placeholder={`${item.sku}-…`} />
                    </Field>
                    <Field label="Доставна">
                      <Input name="unitCost" type="number" step="0.01" min={0} defaultValue={item.unitCost} />
                    </Field>
                    <Field label="Продажна">
                      <Input name="unitPrice" type="number" step="0.01" min={0} defaultValue={item.unitPrice} />
                    </Field>
                    <div className="flex items-end">
                      <SubmitButton variant="secondary">
                        <GitBranch className="h-4 w-4" /> Добави
                      </SubmitButton>
                    </div>
                  </Form>
                </CardBody>
              )}
            </Card>
          )}

          <Card>
            <CardHeader
              title="Складова история"
              description="Последните 50 движения, най-новите отгоре."
              actions={
                <Link href={`/movements?item=${id}`} className="text-xs font-medium text-accent hover:underline">
                  Всички движения
                </Link>
              }
            />
            {item.movements.length === 0 ? (
              <CardBody className="text-sm text-muted">Все още няма движения.</CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Кога</th>
                    <th>Тип</th>
                    <th>Локация</th>
                    <th className="text-right">Промяна</th>
                    <th className="text-right">Общо след</th>
                    <th>Причина</th>
                    <th>Кой</th>
                  </tr>
                </thead>
                <tbody>
                  {item.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-muted">{formatDateTime(m.createdAt)}</td>
                      <td>
                        <Badge tone={statusTone[m.type]}>{label(m.type)}</Badge>
                      </td>
                      <td className="text-muted">
                        {m.location?.name ?? "—"}
                        {m.lot && <span className="ml-1 font-mono text-xs">· {m.lot.lotNumber}</span>}
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
                      <td className="text-xs text-muted">{m.userName ?? "—"}</td>
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
          {(images.length > 0 || writable) && (
            <Card>
              <CardBody>
                <ItemGallery
                  itemId={id}
                  title={title}
                  editable={writable}
                  maxImages={MAX_IMAGES_PER_ITEM}
                  inheritedFrom={ownImages.length === 0 && images.length > 0 ? item.parent?.name : undefined}
                  images={images.map((img) => ({ id: img.id, width: img.width, height: img.height, full: imageUrl(img), thumb: imageUrl(img, "thumb") }))}
                />
              </CardBody>
            </Card>
          )}

          {writable && (
            <Card>
              <CardHeader title="Корекция на наличност" description={tracked ? "При приход въведете партида; при разход изберете партида." : "Приход, разход или точно преброено количество."} />
              <CardBody>
                <Form action={adjustStock.bind(null, id)} className="space-y-3">
                  <Field label="Локация">
                    <Select name="locationId" defaultValue={defaultLoc?.id ?? ""}>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Тип">
                    <Select name="type" defaultValue="in">
                      <option value="in">Приход (+)</option>
                      <option value="out">Разход (−)</option>
                      {!tracked && <option value="adjust">Задай точно количество</option>}
                    </Select>
                  </Field>
                  <Field label="Количество">
                    <Input name="quantity" type="number" min={0} step={1} required placeholder="0" />
                  </Field>
                  {tracked && (
                    <>
                      <Field label={item.tracking === "serial" ? "Серийни номера (при приход)" : "Партида № (при приход)"} hint={item.tracking === "serial" ? "Разделени със запетая." : undefined}>
                        <Input name="lotNumber" className="font-mono" />
                      </Field>
                      {item.tracking === "lot" && (
                        <Field label="Срок на годност (при приход)">
                          <Input name="expiryDate" type="date" />
                        </Field>
                      )}
                      <Field label="Партида (при разход)">
                        <Select name="lotId" defaultValue="">
                          <option value="">— изберете —</option>
                          {item.lots.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.lotNumber} · {l.location.name} · {l.quantity} {item.unit}
                              {l.expiryDate ? ` · до ${formatDate(l.expiryDate)}` : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </>
                  )}
                  <Field label="Причина">
                    <Input name="reason" placeholder="Инвентаризация, брак, продажба…" />
                  </Field>
                  <SubmitButton className="w-full">
                    <SlidersHorizontal className="h-4 w-4" />
                    Приложи
                  </SubmitButton>
                </Form>
              </CardBody>
            </Card>
          )}

          {writable && locations.length > 1 && (
            <Card>
              <CardHeader title="Трансфер между локации" />
              <CardBody>
                <Form action={transfer.bind(null, id)} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="От">
                      <Select name="fromLocationId" defaultValue={defaultLoc?.id ?? ""}>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Към">
                      <Select name="toLocationId" defaultValue={locations.find((l) => l.id !== defaultLoc?.id)?.id ?? ""}>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Количество">
                    <Input name="quantity" type="number" min={1} step={1} required />
                  </Field>
                  {tracked && (
                    <Field label="Партида">
                      <Select name="lotId" defaultValue="" required>
                        <option value="">— изберете —</option>
                        {item.lots.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.lotNumber} · {l.location.name} · {l.quantity}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label="Причина">
                    <Input name="reason" placeholder="Зареждане на магазин…" />
                  </Field>
                  <SubmitButton variant="secondary" className="w-full">
                    <ArrowLeftRight className="h-4 w-4" />
                    Прехвърли
                  </SubmitButton>
                </Form>
              </CardBody>
            </Card>
          )}

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

          {writable && (
            <Card>
              <CardHeader title="Бързи действия" />
              <CardBody className="flex flex-col gap-2">
                <ButtonLink href={`/orders/new?type=purchase&item=${id}`} variant="secondary" size="sm">
                  <Plus className="h-4 w-4" />
                  Поръчай от доставчик
                </ButtonLink>
                <ButtonLink href={`/shipments/new?direction=inbound&item=${id}`} variant="secondary" size="sm">
                  Получи чрез пратка
                </ButtonLink>
                <ButtonLink href={`/shipments/new?direction=outbound&item=${id}`} variant="secondary" size="sm">
                  Изпрати
                </ButtonLink>
              </CardBody>
            </Card>
          )}

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
