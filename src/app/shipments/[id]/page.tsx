import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Pencil, Trash2, Truck, X } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { deleteShipment, setShipmentStatus } from "@/lib/actions/shipments";
import { getShipment } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, formatMoney, formatNumber, label, plural, todayIso } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const s = await getShipment(Number((await params).id));
  return { title: s?.reference ?? "Пратка" };
}

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [shipment, settings] = await Promise.all([getShipment(id), getSettings()]);
  if (!shipment) notFound();

  const open = shipment.status === "pending" || shipment.status === "in_transit";
  const overdue = open && shipment.expectedDate && shipment.expectedDate < todayIso();
  const totalUnits = shipment.lines.reduce((s, l) => s + l.quantity, 0);
  const totalValue = shipment.lines.reduce((s, l) => s + l.quantity * l.item.unitCost, 0);
  const inbound = shipment.direction === "inbound";

  return (
    <>
      <PageHeader
        back={{ href: "/shipments", label: "Пратки" }}
        eyebrow={label(shipment.direction)}
        title={shipment.reference}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[shipment.status]}>{label(shipment.status)}</Badge>
            {overdue && <Badge tone="danger">Закъснява</Badge>}
            {shipment.partner && (
              <span className="text-muted">
                {inbound ? "от" : "до"} {shipment.partner}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/shipments/${id}/edit`} variant="secondary">
              <Pencil className="h-4 w-4" />
              Редакция
            </ButtonLink>
            <form action={deleteShipment.bind(null, id)}>
              <ConfirmButton variant="danger" message={`Да изтрия ли пратка ${shipment.reference}? Вече приложените складови движения се запазват.`}>
                <Trash2 className="h-4 w-4" />
                Изтрий
              </ConfirmButton>
            </form>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Редове"
              description={`${shipment.lines.length} ${plural(shipment.lines.length, "ред", "реда")} · ${formatNumber(totalUnits)} единици · ${formatMoney(totalValue, settings.currency)} по доставна цена`}
            />
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th className="text-right">Количество</th>
                  <th className="text-right">Текуща наличност</th>
                  <th className="text-right">Стойност на реда</th>
                </tr>
              </thead>
              <tbody>
                {shipment.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/items/${l.item.id}`} className="font-medium hover:text-accent">
                        {l.item.name}
                      </Link>
                      <div className="font-mono text-xs text-muted">{l.item.sku}</div>
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {inbound ? "+" : "−"}
                      {formatNumber(l.quantity)} {l.item.unit}
                    </td>
                    <td className={`text-right tabular-nums ${!inbound && open && l.item.quantity < l.quantity ? "text-danger" : "text-muted"}`}>
                      {formatNumber(l.item.quantity)} {l.item.unit}
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(l.quantity * l.item.unitCost, settings.currency)}</td>
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
              {shipment.status === "pending" && (
                <form action={setShipmentStatus.bind(null, id, "in_transit")}>
                  <Button type="submit" variant="secondary" className="w-full">
                    <Truck className="h-4 w-4" />
                    Отбележи „в движение“
                  </Button>
                </form>
              )}
              {open && (
                <form action={setShipmentStatus.bind(null, id, "delivered")}>
                  <ConfirmButton className="w-full" message={inbound ? "Да отбележа ли като доставена и да добавя количествата към наличността?" : "Да отбележа ли като доставена и да извадя количествата от наличността?"}>
                    <Check className="h-4 w-4" />
                    Отбележи като доставена
                  </ConfirmButton>
                </form>
              )}
              {open && (
                <form action={setShipmentStatus.bind(null, id, "cancelled")}>
                  <ConfirmButton variant="ghost" className="w-full" message="Да откажа ли пратката? Наличността няма да се промени.">
                    <X className="h-4 w-4" />
                    Откажи пратката
                  </ConfirmButton>
                </form>
              )}
              {shipment.status === "delivered" && <p className="text-sm text-muted">Доставена на {formatDateTime(shipment.deliveredAt)}. Наличността е обновена.</p>}
              {shipment.status === "cancelled" && <p className="text-sm text-muted">Пратката е отказана. Наличността не е променена.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Детайли" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Row label={inbound ? "Доставчик" : "Клиент"} value={shipment.partner} />
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
