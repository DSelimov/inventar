import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Pencil, Trash2, Truck, Undo2, X } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { createReturnForOrder, createShipmentForRemaining, deleteOrder, setOrderStatus } from "@/lib/actions/orders";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getOrder } from "@/lib/queries";
import { formatDate, formatDateTime, formatMoney, formatNumber, label } from "@/lib/utils";
import { Form } from "@/components/ui/form";
import { lineTotal, sumLines } from "@/lib/money";
import { addQty, subQty, sumQty } from "@/lib/quantity";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const o = await getOrder(ctx.db, Number((await params).id));
  return { title: o?.number ?? "Поръчка" };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const order = await getOrder(ctx.db, id);
  if (!order) notFound();

  const currency = ctx.org.currency;
  const writable = can(ctx.role, "write");
  const purchase = order.type === "purchase";
  const total = sumLines(order.lines, (l) => l.quantity, (l) => l.unitPrice);
  // поръчка отпреди превалутирането: сумата, с която е издадена
  const original = order.originalCurrency ? { currency: order.originalCurrency, total: sumLines(order.lines, (l) => l.quantity, (l) => l.originalUnitPrice ?? 0) } : null;
  const ordered = sumQty(order.lines, (l) => l.quantity);
  const fulfilled = sumQty(order.lines, (l) => Math.min(l.quantity, l.fulfilledQuantity));
  const reserved = new Map<number, number>();
  for (const s of order.shipments) if (!s.isReturn && (s.status === "pending" || s.status === "in_transit")) for (const l of s.lines) reserved.set(l.itemId, addQty(reserved.get(l.itemId) ?? 0, l.quantity));
  const remainingToShip = sumQty(order.lines, (l) => Math.max(0, subQty(subQty(l.quantity, l.fulfilledQuantity), reserved.get(l.itemId) ?? 0)));
  const active = order.status === "confirmed" || order.status === "partial";
  const returned = sumQty(order.lines, (l) => l.returnedQuantity);
  const returnable = sumQty(order.lines, (l) => subQty(l.fulfilledQuantity, l.returnedQuantity));

  return (
    <>
      <PageHeader
        back={{ href: "/orders", label: "Поръчки" }}
        eyebrow={label(order.type)}
        title={order.number}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[order.status]}>{label(order.status)}</Badge>
            {order.partner && (
              <Link href={`/partners/${order.partner.id}`} className="text-muted hover:text-accent">
                {purchase ? "от" : "за"} {order.partner.name}
              </Link>
            )}
            {order.location && <span className="text-muted">· {order.location.name}</span>}
          </span>
        }
        actions={
          writable && (
            <>
              {order.status === "draft" && (
                <ButtonLink href={`/orders/${id}/edit`} variant="secondary">
                  <Pencil className="h-4 w-4" />
                  Редакция
                </ButtonLink>
              )}
              {can(ctx.role, "delete") && (
                <Form action={deleteOrder.bind(null, id)}>
                  <ConfirmButton variant="danger" message={`Да изтрия ли поръчка ${order.number}? Свързаните пратки остават.`}>
                    <Trash2 className="h-4 w-4" />
                    Изтрий
                  </ConfirmButton>
                </Form>
              )}
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Стойност" value={formatMoney(total, currency)} hint={original ? `издадена за ${formatMoney(original.total, original.currency)}` : undefined} />
        <Stat label="Изпълнено" value={`${formatNumber(fulfilled)} / ${formatNumber(ordered)}`} hint={ordered ? `${Math.round((fulfilled / ordered) * 100)} %` : undefined} />
        <Stat label="Очаквана дата" value={formatDate(order.expectedDate)} hint={`Поръчана на ${formatDate(order.orderDate)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Редове" />
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th className="text-right">Поръчано</th>
                  <th className="text-right">Доставено</th>
                  <th className="text-right">Остава</th>
                  {returned > 0 && <th className="text-right">Върнато</th>}
                  <th className="text-right">Ед. цена</th>
                  <th className="text-right">Общо</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => {
                  const rest = Math.max(0, subQty(l.quantity, l.fulfilledQuantity));
                  return (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/items/${l.item.id}`} className="font-medium hover:text-accent">
                          {l.item.name}
                          {l.item.variantLabel && <span className="text-muted"> · {l.item.variantLabel}</span>}
                        </Link>
                        <div className="font-mono text-xs text-muted">{l.item.sku}</div>
                      </td>
                      <td className="text-right tabular-nums">
                        {formatNumber(l.quantity)} {l.item.unit}
                      </td>
                      <td className="text-right tabular-nums text-success">{formatNumber(l.fulfilledQuantity)}</td>
                      <td className={`text-right tabular-nums ${rest > 0 ? "font-medium text-warning" : "text-muted"}`}>{formatNumber(rest)}</td>
                      {returned > 0 && <td className={`text-right tabular-nums ${l.returnedQuantity ? "text-danger" : "text-muted"}`}>{l.returnedQuantity ? formatNumber(l.returnedQuantity) : "—"}</td>}
                      <td className="text-right tabular-nums text-muted">
                        {formatMoney(l.unitPrice, currency)}
                        {original && l.originalUnitPrice !== null && <div className="text-xs">{formatMoney(l.originalUnitPrice, original.currency)}</div>}
                      </td>
                      <td className="text-right tabular-nums">{formatMoney(lineTotal(l.quantity, l.unitPrice), currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Пратки по поръчката" description="Всяка доставена пратка увеличава изпълнението." />
            {order.shipments.length === 0 ? (
              <CardBody className="text-sm text-muted">Все още няма пратки.</CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Референция</th>
                    <th>Статус</th>
                    <th>Очаквана</th>
                    <th className="text-right">Единици</th>
                  </tr>
                </thead>
                <tbody>
                  {order.shipments.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/shipments/${s.id}`} className="font-medium hover:text-accent">
                          {s.reference}
                        </Link>
                        {s.isReturn && (
                          <Badge tone="warning" className="ml-2">
                            Връщане
                          </Badge>
                        )}
                      </td>
                      <td>
                        <Badge tone={statusTone[s.status]}>{label(s.status)}</Badge>
                      </td>
                      <td className="text-muted">{formatDate(s.expectedDate)}</td>
                      <td className="text-right tabular-nums">{formatNumber(sumQty(s.lines, (l) => l.quantity))}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {order.notes && (
            <Card>
              <CardHeader title="Бележки" />
              <CardBody className="whitespace-pre-line text-sm">{order.notes}</CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {writable && (
            <Card>
              <CardHeader title="Действия" />
              <CardBody className="space-y-2">
                {order.status === "draft" && (
                  <Form action={setOrderStatus.bind(null, id, "confirmed")}>
                    <Button type="submit" className="w-full">
                      <Check className="h-4 w-4" /> Потвърди поръчката
                    </Button>
                  </Form>
                )}
                {active && (
                  <Form action={createShipmentForRemaining.bind(null, id)}>
                    <Button type="submit" className="w-full" disabled={remainingToShip === 0}>
                      <Truck className="h-4 w-4" /> Създай пратка за оставащото ({formatNumber(remainingToShip)})
                    </Button>
                  </Form>
                )}
                {returnable > 0 && (
                  <Form action={createReturnForOrder.bind(null, id)}>
                    <Button type="submit" variant="secondary" className="w-full">
                      <Undo2 className="h-4 w-4" /> {purchase ? "Връщане към доставчика" : "Връщане от клиента"}
                    </Button>
                  </Form>
                )}
                {order.status === "partial" && (
                  <Form action={setOrderStatus.bind(null, id, "completed")}>
                    <ConfirmButton variant="secondary" className="w-full" message="Да приключа ли поръчката без да се доставя остатъкът?">
                      Приключи с остатък
                    </ConfirmButton>
                  </Form>
                )}
                {(order.status === "draft" || active) && (
                  <Form action={setOrderStatus.bind(null, id, "cancelled")}>
                    <ConfirmButton variant="ghost" className="w-full" message="Да откажа ли поръчката?">
                      <X className="h-4 w-4" /> Откажи
                    </ConfirmButton>
                  </Form>
                )}
                {order.status === "completed" && <p className="text-sm text-muted">Поръчката е изпълнена.</p>}
                {order.status === "cancelled" && <p className="text-sm text-muted">Поръчката е отказана.</p>}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Детайли" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Row label="Тип" value={label(order.type)} />
                <Row label={purchase ? "Доставчик" : "Клиент"} value={order.partner?.name} />
                <Row label="Локация" value={order.location?.name} />
                <Row label="Създадена" value={formatDateTime(order.createdAt)} />
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  );
}
