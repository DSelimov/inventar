import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ban, FileMinus, FilePlus, Mail, Printer, Send, Trash2 } from "lucide-react";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { addInvoicePayment, cancelInvoiceAction, deleteInvoiceDraft, emailInvoice, issueInvoiceAction, noteForInvoice, saveInvoiceDraft } from "@/lib/actions/invoices";
import { requireContext } from "@/lib/auth";
import { localTodayIso } from "@/lib/dates";
import { amountDue, INVOICE_STATUS_LABELS, KIND_TITLES, PAYMENT_LABELS, PAYMENT_TONES } from "@/lib/invoicing";
import { sumMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getInvoice, listItemOptions, listPartners, listVatRates } from "@/lib/queries";
import { getCompanyDetails } from "@/lib/settings";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/utils";
import { vatSummary } from "@/lib/vat";

export const metadata: Metadata = { title: "Фактура" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const inv = await getInvoice(ctx.db, id);
  if (!inv) notFound();
  const money = (v: number) => formatMoney(v, inv.currency);
  const writable = can(ctx.role, "write");
  const draft = inv.status === "draft";
  const payable = inv.status === "issued" && (inv.kind === "invoice" || inv.kind === "debit_note");
  const title = `${KIND_TITLES[inv.kind]} ${inv.number ? `№ ${inv.number}` : "(чернова)"}`;

  const [partners, items, vatRates, company, due] = await Promise.all([
    draft ? listPartners(ctx.db) : Promise.resolve([]),
    draft ? listItemOptions(ctx.db) : Promise.resolve([]),
    draft ? listVatRates(ctx.db) : Promise.resolve([]),
    getCompanyDetails(ctx.db),
    payable ? amountDue(ctx.db, inv.id) : Promise.resolve(0),
  ]);
  const sum = vatSummary(inv.lines);
  const overdue = payable && inv.paymentStatus !== "paid" && inv.dueDate !== null && inv.dueDate < localTodayIso();
  const missingCompany = !company.legalName || !company.eik || !company.address;

  return (
    <>
      <PageHeader
        title={title}
        description={[inv.recipientName ?? inv.partner?.name, inv.issueDate && `от ${formatDate(inv.issueDate, "dd.MM.yyyy")}`, inv.order && `поръчка ${inv.order.number}`].filter(Boolean).join(" · ")}
        back={{ href: "/invoices", label: "Фактури" }}
        actions={
          <>
            <a href={`/print/invoices/${inv.id}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
              <Printer className="h-4 w-4" /> {draft ? "Преглед (PDF)" : "Оригинал (PDF)"}
            </a>
            {!draft && (
              <a href={`/print/invoices/${inv.id}?copy=1`} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
                Копие
              </a>
            )}
            {draft && writable && (
              <Form action={deleteInvoiceDraft.bind(null, inv.id)}>
                <ConfirmButton variant="danger" message="Да изтрия ли черновата?">
                  <Trash2 className="h-4 w-4" /> Изтрий
                </ConfirmButton>
              </Form>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={inv.status === "issued" ? "success" : inv.status === "cancelled" ? "danger" : "neutral"}>{INVOICE_STATUS_LABELS[inv.status]}</Badge>
        {payable && <Badge tone={overdue ? "danger" : PAYMENT_TONES[inv.paymentStatus]}>{overdue ? `Просрочена от ${formatDate(inv.dueDate)}` : PAYMENT_LABELS[inv.paymentStatus]}</Badge>}
        {inv.related && (
          <Link href={`/invoices/${inv.related.id}`} className="text-sm text-accent hover:underline">
            Към фактура № {inv.related.number}
          </Link>
        )}
      </div>

      {draft ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
          <InvoiceEditor
            invoice={inv}
            lines={inv.lines}
            partners={partners.map((p) => ({ id: p.id, name: p.name }))}
            items={items.map((i) => ({ id: i.id, name: i.name, variantLabel: i.variantLabel, sku: i.sku, unit: i.unit, unitPrice: i.unitPrice, vatRateId: i.vatRateId }))}
            vatRates={vatRates}
            action={saveInvoiceDraft.bind(null, inv.id)}
          />
          <Card className="h-fit">
            <CardHeader title="Издаване" description="Номерът се заема при издаване; после документът не се променя." />
            <CardBody className="space-y-3 text-sm">
              {missingCompany && (
                <p className="rounded-lg bg-warning-soft px-3 py-2 text-warning">
                  Попълнете юридическото име, ЕИК и адреса в <Link href="/settings" className="underline">Настройки</Link>.
                </p>
              )}
              <p className="text-muted">Запазете черновата преди издаване. Общо: {money(inv.grossTotal)}.</p>
              {writable && (
                <Form action={issueInvoiceAction.bind(null, inv.id)}>
                  <ConfirmButton className="w-full" message={`Да издам ли ${KIND_TITLES[inv.kind].toLowerCase()} за ${money(inv.grossTotal)}? Документът получава номер и не може да се редактира.`}>
                    <Send className="h-4 w-4" /> Издай
                  </ConfirmButton>
                </Form>
              )}
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Party title="Доставчик" name={inv.supplierName} address={inv.supplierAddress} eik={inv.supplierEik} vat={inv.supplierVatNumber} mol={inv.supplierMol} />
              <Party title="Получател" name={inv.recipientName} address={inv.recipientAddress} eik={inv.recipientEik} vat={inv.recipientVatNumber} mol={inv.recipientMol} />
            </div>
            <Card>
              <CardHeader title="Редове" description={`Данъчно събитие ${formatDate(inv.taxEventDate)}${inv.dueDate ? ` · падеж ${formatDate(inv.dueDate)}` : ""}${inv.paymentMethod ? ` · ${inv.paymentMethod}` : ""}`} />
              <Table>
                <thead>
                  <tr>
                    <th>Описание</th>
                    <th className="text-right">К-во</th>
                    <th className="text-right">Ед. цена</th>
                    <th className="text-right">ДДС</th>
                    <th className="text-right">Основа</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.description}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {formatNumber(l.quantity)} {l.unit}
                      </td>
                      <td className="text-right tabular-nums text-muted">{money(l.unitPrice)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums text-muted">{formatNumber(l.vatRate)} %</td>
                      <td className="text-right tabular-nums">{money(l.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="border-t border-line px-5 py-3 text-sm">
                {sum.rows.map((r) => (
                  <div key={`${r.rate}-${r.legalBasis}`} className="flex justify-end gap-6 tabular-nums text-muted">
                    <span>
                      ДДС {formatNumber(r.rate)} %{r.rate === 0 && r.legalBasis ? ` (${r.legalBasis})` : ""} върху {money(r.net)}
                    </span>
                    <span className="w-28 text-right">{money(r.vat)}</span>
                  </div>
                ))}
                <div className="mt-1 flex justify-end gap-6 font-semibold tabular-nums">
                  <span>{inv.kind === "credit_note" ? "Сума за намаление" : "Сума за плащане"}</span>
                  <span className="w-28 text-right">{money(inv.grossTotal)}</span>
                </div>
              </div>
            </Card>
            {inv.notesFor.length > 0 && (
              <Card>
                <CardHeader title="Известия към фактурата" />
                <CardBody className="space-y-1 text-sm">
                  {inv.notesFor.map((n) => (
                    <div key={n.id} className="flex justify-between">
                      <Link href={`/invoices/${n.id}`} className="hover:text-accent">
                        {KIND_TITLES[n.kind]} {n.number ? `№ ${n.number}` : "(чернова)"}
                      </Link>
                      <span className="tabular-nums text-muted">
                        {n.kind === "credit_note" ? "−" : "+"}
                        {money(n.grossTotal)} · {INVOICE_STATUS_LABELS[n.status]}
                      </span>
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {payable && (
              <Card>
                <CardHeader title="Плащания" description={`Дължимо ${money(due)} · платено ${money(inv.paidAmount)} · остава ${money(Math.max(0, sumMoney([due, -inv.paidAmount])))}`} />
                <CardBody className="space-y-3 text-sm">
                  {inv.payments.map((p) => (
                    <div key={p.id} className="flex justify-between">
                      <span>
                        {formatDate(p.paidOn)}
                        {p.method ? ` · ${p.method}` : ""}
                      </span>
                      <span className="tabular-nums">{money(p.amount)}</span>
                    </div>
                  ))}
                  {writable && inv.paymentStatus !== "paid" && (
                    <Form action={addInvoicePayment.bind(null, inv.id)} className="grid grid-cols-2 gap-2 border-t border-line pt-3">
                      <Input name="amount" type="number" min="0.01" step="0.01" defaultValue={Math.max(0, sumMoney([due, -inv.paidAmount]))} required aria-label="Сума" />
                      <Input name="paidOn" type="date" defaultValue={localTodayIso()} aria-label="Дата" />
                      <Input name="method" placeholder="Банков превод" className="col-span-2" aria-label="Начин" />
                      <SubmitButton variant="secondary" size="sm" className="col-span-2">
                        Отбележи плащане
                      </SubmitButton>
                    </Form>
                  )}
                </CardBody>
              </Card>
            )}
            {inv.status === "issued" && writable && (
              <Card>
                <CardHeader title="Изпрати по имейл" description="PDF оригинал до получателя." />
                <CardBody>
                  <Form action={emailInvoice.bind(null, inv.id)} className="space-y-2">
                    <Input name="to" type="email" defaultValue={inv.partner?.email ?? ""} placeholder="имейл на получателя" required />
                    <SubmitButton variant="secondary" size="sm" className="w-full">
                      <Mail className="h-4 w-4" /> Изпрати
                    </SubmitButton>
                  </Form>
                </CardBody>
              </Card>
            )}
            {inv.status === "issued" && inv.kind === "invoice" && writable && (
              <Card>
                <CardHeader title="Корекция" description="Издаденият документ се коригира само с известие." />
                <CardBody className="flex flex-col gap-2">
                  <Form action={noteForInvoice.bind(null, inv.id, "credit_note")}>
                    <SubmitButton variant="secondary" size="sm" className="w-full">
                      <FileMinus className="h-4 w-4" /> Кредитно известие
                    </SubmitButton>
                  </Form>
                  <Form action={noteForInvoice.bind(null, inv.id, "debit_note")}>
                    <SubmitButton variant="secondary" size="sm" className="w-full">
                      <FilePlus className="h-4 w-4" /> Дебитно известие
                    </SubmitButton>
                  </Form>
                </CardBody>
              </Card>
            )}
            {inv.status === "issued" && can(ctx.role, "delete") && (
              <Card>
                <CardHeader title="Анулиране" description="Номерът остава зает; документът не важи." />
                <CardBody>
                  <Form action={cancelInvoiceAction.bind(null, inv.id)} className="space-y-2">
                    <Field label="Причина">
                      <Input name="reason" required placeholder="Грешен получател…" />
                    </Field>
                    <ConfirmButton variant="danger" size="sm" className="w-full" message="Да анулирам ли документа? Действието е окончателно.">
                      <Ban className="h-4 w-4" /> Анулирай
                    </ConfirmButton>
                  </Form>
                </CardBody>
              </Card>
            )}
            <p className="text-xs text-muted">
              Създаден от {inv.createdBy ?? "—"} на {formatDateTime(inv.createdAt)}
              {inv.issuedAt ? ` · издаден от ${inv.issuedBy} на ${formatDateTime(inv.issuedAt)}` : ""}
              {inv.status === "cancelled" && inv.reason ? ` · анулиран: ${inv.reason}` : ""}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Party(p: { title: string; name: string | null; address: string | null; eik: string | null; vat: string | null; mol: string | null }) {
  return (
    <Card>
      <CardBody className="space-y-0.5 text-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">{p.title}</div>
        <div className="font-semibold">{p.name ?? "—"}</div>
        {p.address && <div className="text-muted">{p.address}</div>}
        {p.eik && <div className="text-muted">ЕИК {p.eik}</div>}
        {p.vat && <div className="text-muted">ДДС № {p.vat}</div>}
        {p.mol && <div className="text-muted">МОЛ {p.mol}</div>}
      </CardBody>
    </Card>
  );
}
