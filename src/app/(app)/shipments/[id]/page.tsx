import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Pencil, Printer, Trash2, Truck, X } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button, buttonClasses, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { deleteShipment, setShipmentStatus } from "@/lib/actions/shipments";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getShipment } from "@/lib/queries";
import { formatDate, formatDateTime, formatMoney, formatNumber, label, plural, todayIso } from "@/lib/utils";
import { Form } from "@/components/ui/form";
import { lineTotal, sumLines } from "@/lib/money";
import { sumQty } from "@/lib/quantity";
import { eq } from "drizzle-orm";
import { orderLines } from "@/db/tenant-schema";
import { orderVat } from "@/lib/vat";
import { WaybillCard } from "@/components/shipments/waybill-card";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const s = await getShipment(ctx.db, Number((await params).id));
  return { title: s?.reference ?? "Пратка" };
}

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const shipment = await getShipment(ctx.db, id);
  if (!shipment) notFound();

  const currency = ctx.org.currency;
  const writable = can(ctx.role, "write");
  const open = shipment.status === "pending" || shipment.status === "in_transit";
  const overdue = open && shipment.expectedDate && shipment.expectedDate < todayIso();
  const totalUnits = sumQty(shipment.lines, (l) => l.quantity);
  const totalValue = sumLines(shipment.lines, (l) => l.quantity, (l) => l.item.unitCost);
  const inbound = shipment.direction === "inbound";
  const missingLots = shipment.lines.filter((l) => l.item.tracking !== "none" && (inbound ? !l.lotNumber : !l.lotId));
  const partnerName = shipment.partnerRecord?.name ?? shipment.partner;
  // наложен платеж по подразбиране: стойността с ДДС на клиентската поръчка
  const codDefault = shipment.order?.type === "sales" ? orderVat(shipment.order, (await ctx.db.query.orderLines.findMany({ where: eq(orderLines.orderId, shipment.order.id) }))).gross : null;

  return (
    <>
      <PageHeader
        back={{ href: "/shipments", label: "Пратки" }}
        eyebrow={shipment.isReturn ? (inbound ? "Връщане от клиент" : "Връщане към доставчик") : label(shipment.direction)}
        title={shipment.reference}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[shipment.status]}>{label(shipment.status)}</Badge>
            {shipment.isReturn && <Badge tone="warning">Връщане</Badge>}
            {overdue && <Badge tone="danger">Закъснява</Badge>}
            {partnerName && (
              <span className="text-muted">
                {inbound ? "от" : "до"}{" "}
                {shipment.partnerRecord ? (
                  <Link href={`/partners/${shipment.partnerRecord.id}`} className="hover:text-accent">
                    {partnerName}
                  </Link>
                ) : (
                  partnerName
                )}
              </span>
            )}
            {shipment.order && (
              <Link href={`/orders/${shipment.order.id}`} className="text-accent hover:underline">
                Поръчка {shipment.order.number}
              </Link>
            )}
          </span>
        }
        actions={
          <>
            <a href={`/print/shipments/${id}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
              <Printer className="h-4 w-4" />
              {shipment.isReturn ? "Протокол за връщане" : shipment.direction === "inbound" ? "Приемателен протокол" : "Стокова разписка"}
            </a>
            {writable && (
            <>
              <ButtonLink href={`/shipments/${id}/edit`} variant="secondary">
                <Pencil className="h-4 w-4" />
                Редакция
              </ButtonLink>
              {can(ctx.role, "delete") && (
                <Form action={deleteShipment.bind(null, id)}>
                  <ConfirmButton variant="danger" message={`Да изтрия ли пратка ${shipment.reference}? Вече приложените складови движения се запазват.`}>
                    <Trash2 className="h-4 w-4" />
                    Изтрий
                  </ConfirmButton>
                </Form>
              )}
            </>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Редове" description={`${shipment.lines.length} ${plural(shipment.lines.length, "ред", "реда")} · ${formatNumber(totalUnits)} единици · ${formatMoney(totalValue, currency)} по доставна цена`} />
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th>Партида / сер. №</th>
                  <th className="text-right">Количество</th>
                  <th className="text-right">Текуща наличност</th>
                  <th className="text-right">Стойност</th>
                </tr>
              </thead>
              <tbody>
                {shipment.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/items/${l.item.id}`} className="font-medium hover:text-accent">
                        {l.item.name}
                        {l.item.variantLabel && <span className="text-muted"> · {l.item.variantLabel}</span>}
                      </Link>
                      <div className="font-mono text-xs text-muted">{l.item.sku}</div>
                    </td>
                    <td className="font-mono text-xs">
                      {l.item.tracking === "none" ? (
                        <span className="text-muted">—</span>
                      ) : inbound ? (
                        l.lotNumber ? (
                          <>
                            {l.lotNumber}
                            {l.expiryDate && <span className="text-muted"> · до {formatDate(l.expiryDate)}</span>}
                          </>
                        ) : (
                          <Badge tone="warning">липсва</Badge>
                        )
                      ) : l.lot ? (
                        l.lot.lotNumber
                      ) : (
                        <Badge tone="warning">липсва</Badge>
                      )}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {inbound ? "+" : "−"}
                      {formatNumber(l.quantity)} {l.item.unit}
                    </td>
                    <td className={`text-right tabular-nums ${!inbound && open && l.item.quantity < l.quantity ? "text-danger" : "text-muted"}`}>
                      {formatNumber(l.item.quantity)} {l.item.unit}
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(lineTotal(l.quantity, l.item.unitCost), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {shipment.notes && (
            <Card>
              <CardHeader title="Бележки" />
              <CardBody className="whitespace-pre-line text-sm">{shipment.notes}</CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Статус" />
            <CardBody className="space-y-2">
              {writable && open && missingLots.length > 0 && (
                <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                  {missingLots.length} {plural(missingLots.length, "ред изисква", "реда изискват")} партида или сериен номер. Допълнете ги чрез „Редакция“ преди доставка.
                </p>
              )}
              {writable && shipment.status === "pending" && (
                <Form action={setShipmentStatus.bind(null, id, "in_transit")}>
                  <Button type="submit" variant="secondary" className="w-full">
                    <Truck className="h-4 w-4" />
                    Отбележи „в движение“
                  </Button>
                </Form>
              )}
              {writable && open && (
                <Form action={setShipmentStatus.bind(null, id, "delivered")}>
                  <ConfirmButton className="w-full" disabled={missingLots.length > 0} message={inbound ? "Да отбележа ли като доставена и да добавя количествата към наличността?" : "Да отбележа ли като доставена и да извадя количествата от наличността?"}>
                    <Check className="h-4 w-4" />
                    Отбележи като доставена
                  </ConfirmButton>
                </Form>
              )}
              {writable && open && (
                <Form action={setShipmentStatus.bind(null, id, "cancelled")}>
                  <ConfirmButton variant="ghost" className="w-full" message="Да откажа ли пратката? Наличността няма да се промени.">
                    <X className="h-4 w-4" />
                    Откажи пратката
                  </ConfirmButton>
                </Form>
              )}
              {shipment.status === "delivered" && <p className="text-sm text-muted">Доставена на {formatDateTime(shipment.deliveredAt)}. Наличността е обновена.</p>}
              {shipment.status === "cancelled" && <p className="text-sm text-muted">Пратката е отказана. Наличността не е променена.</p>}
              {!writable && open && <p className="text-sm text-muted">Нямате права да променяте статуса.</p>}
            </CardBody>
          </Card>

          <WaybillCard shipment={shipment} db={ctx.db} org={ctx.org} phone={shipment.partnerRecord?.phone ?? ""} cod={codDefault} writable={writable} />

          <Card>
            <CardHeader title="Детайли" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Row label="Локация" value={shipment.location?.name} />
                <Row label={inbound ? "Доставчик" : "Клиент"} value={partnerName} />
                <Row label="Очаквана дата" value={formatDate(shipment.expectedDate)} />
                <Row label="Куриер" value={shipment.carrier} />
                <Row label="Проследяване" value={shipment.trackingNumber} mono />
                <Row label="Създадена" value={formatDateTime(shipment.createdAt)} />
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</dd>
    </div>
  );
}
