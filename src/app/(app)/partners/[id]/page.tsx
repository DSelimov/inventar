import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, Trash2 } from "lucide-react";
import { PartnerFields } from "@/components/partners/partner-form";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { checkPartnerVies, deletePartner, updatePartner } from "@/lib/actions/partners";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPartner } from "@/lib/queries";
import { formatDate, formatMoney, label } from "@/lib/utils";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { orderVat } from "@/lib/vat";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const p = await getPartner(ctx.db, Number((await params).id));
  return { title: p?.name ?? "Партньор" };
}

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const partner = await getPartner(ctx.db, id);
  if (!partner) notFound();
  const writable = can(ctx.role, "write");

  return (
    <>
      <PageHeader
        back={{ href: "/partners", label: "Партньори" }}
        title={partner.name}
        description={
          <span className="flex items-center gap-2">
            <Badge tone="neutral">{label(partner.type)}</Badge>
            {partner.leadTimeDays ? <span className="text-muted">Срок на доставка {partner.leadTimeDays} дни</span> : null}
          </span>
        }
        actions={
          can(ctx.role, "delete") && (
            <Form action={deletePartner.bind(null, id)}>
              <ConfirmButton variant="danger" message={`Да изтрия ли „${partner.name}“? Поръчките и пратките остават без партньор.`}>
                <Trash2 className="h-4 w-4" /> Изтрий
              </ConfirmButton>
            </Form>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Поръчки" />
            {partner.orders.length === 0 ? (
              <CardBody className="text-sm text-muted">Няма поръчки.</CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>Тип</th>
                    <th>Статус</th>
                    <th>Дата</th>
                    <th className="text-right">Стойност</th>
                  </tr>
                </thead>
                <tbody>
                  {partner.orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/orders/${o.id}`} className="font-medium hover:text-accent">
                          {o.number}
                        </Link>
                      </td>
                      <td className="text-muted">{o.type === "purchase" ? "Доставка" : "Клиентска"}</td>
                      <td>
                        <Badge tone={statusTone[o.status]}>{label(o.status)}</Badge>
                      </td>
                      <td className="text-muted">{formatDate(o.orderDate)}</td>
                      <td className="text-right tabular-nums">{formatMoney(orderVat(o, o.lines).gross, ctx.org.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Пратки" />
            {partner.shipments.length === 0 ? (
              <CardBody className="text-sm text-muted">Няма пратки.</CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Референция</th>
                    <th>Посока</th>
                    <th>Статус</th>
                    <th>Очаквана</th>
                  </tr>
                </thead>
                <tbody>
                  {partner.shipments.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/shipments/${s.id}`} className="font-medium hover:text-accent">
                          {s.reference}
                        </Link>
                      </td>
                      <td>
                        <Badge tone={statusTone[s.direction]}>{label(s.direction)}</Badge>
                      </td>
                      <td>
                        <Badge tone={statusTone[s.status]}>{label(s.status)}</Badge>
                      </td>
                      <td className="text-muted">{formatDate(s.expectedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Данни" />
          <CardBody>
            {writable ? (
              <Form action={updatePartner.bind(null, id)}>
                <PartnerFields partner={partner} submitLabel="Запази" />
              </Form>
            ) : (
              <dl className="space-y-2 text-sm">
                {[
                  ["Лице за контакт", partner.contactName],
                  ["Имейл", partner.email],
                  ["Телефон", partner.phone],
                  ["Адрес", partner.address],
                  ["ЕИК", partner.eik],
                  ["ДДС №", partner.vatNumber ?? (partner.vatRegistered ? "регистриран" : "нерегистриран")],
                  ["Държава", partner.country],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
                    <dd>{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
          {partner.vatNumber && (
            <CardBody className="flex flex-wrap items-center justify-between gap-2 border-t border-line text-sm">
              <span className="flex items-center gap-2">
                <Badge tone={partner.viesValid === true ? "success" : partner.viesValid === false ? "danger" : "neutral"}>
                  {partner.viesValid === true ? "VIES: валиден" : partner.viesValid === false ? "VIES: невалиден" : "VIES: не е проверен"}
                </Badge>
                {partner.viesCheckedAt && <span className="text-xs text-muted">{formatDate(partner.viesCheckedAt)}</span>}
              </span>
              {writable && (
                <Form action={checkPartnerVies.bind(null, id)}>
                  <SubmitButton variant="secondary" size="sm">
                    <ShieldCheck className="h-4 w-4" /> Провери във VIES
                  </SubmitButton>
                </Form>
              )}
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
