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
import { getPartner, listPriceGroups } from "@/lib/queries";
import { payPartnerAction } from "@/lib/actions/cash";
import { accountBalances, openDocuments, partnerBalance } from "@/lib/cash";
import { consignmentStock } from "@/lib/consignment";
import { localTodayIso } from "@/lib/dates";
import { Field, Input, Select } from "@/components/ui/fields";
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
  const [priceGroups, balance, openIn, openOut, accounts] = await Promise.all([
    listPriceGroups(ctx.db, true),
    partnerBalance(ctx.db, id),
    openDocuments(ctx.db, id, "in"),
    openDocuments(ctx.db, id, "out"),
    accountBalances(ctx.db),
  ]);
  const consigned = await consignmentStock(ctx.db, id);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const isCustomer = partner.type !== "supplier";
  const isSupplier = partner.type !== "customer";
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
            {partner.priceGroupId ? <Badge tone="accent">Цени: {priceGroups.find((g) => g.id === partner.priceGroupId)?.name}</Badge> : null}
            {partner.discountPercent > 0 ? <Badge tone="success">Отстъпка {partner.discountPercent} %</Badge> : null}
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
            <CardHeader
              title="Салдо и плащане"
              description="Фактури и доставки без фактура минус платеното. Плащането покрива най-старите документи, остатъкът е аванс."
              actions={
                <Link href={`/cash?partner=${id}`} className="text-xs font-medium text-accent hover:underline">
                  Каса и банка
                </Link>
              }
            />
            <CardBody className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {isCustomer && (
                  <div className="rounded-lg bg-surface-2 p-4">
                    <div className="text-xs text-muted">Дължи ни</div>
                    <div className={`mt-1 text-xl font-semibold tabular-nums ${balance.receivable > 0 ? "text-danger" : balance.receivable < 0 ? "text-success" : ""}`}>{money(balance.receivable)}</div>
                    <div className="mt-1 text-xs text-muted tabular-nums">
                      фактури {money(balance.invoiced)} · без фактура {money(balance.deliveredWithoutInvoice)} · платено {money(balance.paidIn)}
                      {balance.receivable < 0 && " · аванс"}
                    </div>
                    {balance.overdueInvoices > 0 && <Badge tone="danger" className="mt-2">{balance.overdueInvoices} просрочени фактури</Badge>}
                  </div>
                )}
                {isSupplier && (
                  <div className="rounded-lg bg-surface-2 p-4">
                    <div className="text-xs text-muted">Дължим му</div>
                    <div className={`mt-1 text-xl font-semibold tabular-nums ${balance.payable > 0 ? "text-warning" : ""}`}>{money(balance.payable)}</div>
                    <div className="mt-1 text-xs text-muted tabular-nums">
                      получено {money(balance.receivedFromSupplier)} · платено {money(balance.paidOut)}
                      {balance.payable < 0 && " · аванс"}
                    </div>
                  </div>
                )}
              </div>
              {[...openIn.map((d) => ({ ...d, dir: "in" as const })), ...openOut.map((d) => ({ ...d, dir: "out" as const }))].length > 0 && (
                <Table>
                  <thead>
                    <tr>
                      <th>Неплатен документ</th>
                      <th>Падеж</th>
                      <th className="text-right">Сума</th>
                      <th className="text-right">Остатък</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...openIn.map((d) => ({ ...d, dir: "in" as const })), ...openOut.map((d) => ({ ...d, dir: "out" as const }))].map((d) => (
                      <tr key={`${d.dir}-${d.kind}-${d.id}`}>
                        <td>
                          <Link href={d.kind === "invoice" ? `/invoices/${d.id}` : `/orders/${d.id}`} className="font-medium hover:text-accent">
                            {d.kind === "invoice" ? "Фактура" : d.dir === "in" ? "Продажба" : "Доставка"} {d.number}
                          </Link>
                          <div className="text-xs text-muted">{formatDate(d.date)}</div>
                        </td>
                        <td className="text-xs">{d.dueDate ? formatDate(d.dueDate) : "—"}</td>
                        <td className="text-right tabular-nums">{money(d.total)}</td>
                        <td className="text-right font-semibold tabular-nums">{money(d.open)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {writable && (
                <Form action={payPartnerAction.bind(null, id)} className="grid gap-3 sm:grid-cols-[9rem_1fr_1fr_9rem_auto] sm:items-end">
                  <Field label="Посока">
                    <Select name="direction" defaultValue={isCustomer ? "in" : "out"}>
                      {isCustomer && <option value="in">Плаща ни</option>}
                      {isSupplier && <option value="out">Плащаме му</option>}
                    </Select>
                  </Field>
                  <Field label="Сума">
                    <Input name="amount" type="number" min={0.01} step="0.01" required defaultValue={isCustomer ? (balance.receivable > 0 ? balance.receivable : "") : balance.payable > 0 ? balance.payable : ""} />
                  </Field>
                  <Field label="Каса / сметка">
                    <Select name="accountId" defaultValue={accounts.find((a) => a.isDefault)?.id}>
                      {accounts
                        .filter((a) => a.active)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Дата">
                    <Input name="date" type="date" defaultValue={localTodayIso()} />
                  </Field>
                  <SubmitButton>Запиши плащане</SubmitButton>
                </Form>
              )}
            </CardBody>
          </Card>

          {(consigned.length > 0 || (writable && isCustomer)) && (
            <Card>
              <CardHeader
                title="Консигнация"
                description={consigned.length ? "Стока при партньора — ваша, докато не отчете продаденото." : "Няма стока на консигнация."}
                actions={
                  writable && (
                    <span className="flex gap-3 text-xs font-medium">
                      <Link href={`/consignments/new?partner=${id}&kind=give`} className="text-accent hover:underline">
                        Дай
                      </Link>
                      {consigned.length > 0 && (
                        <>
                          <Link href={`/consignments/new?partner=${id}&kind=report`} className="text-accent hover:underline">
                            Отчет за продадено
                          </Link>
                          <Link href={`/consignments/new?partner=${id}&kind=return`} className="text-accent hover:underline">
                            Връщане
                          </Link>
                        </>
                      )}
                    </span>
                  )
                }
              />
              {consigned.length > 0 && (
                <Table>
                  <tbody>
                    {consigned.map((c) => (
                      <tr key={c.itemId}>
                        <td>
                          <Link href={`/items/${c.itemId}`} className="hover:text-accent">
                            {c.name}
                          </Link>
                        </td>
                        <td className="text-right tabular-nums">
                          {c.quantity} {c.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}

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
                <PartnerFields partner={partner} submitLabel="Запази" priceGroups={priceGroups} />
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
