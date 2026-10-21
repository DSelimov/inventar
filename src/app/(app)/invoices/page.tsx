import Link from "next/link";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/search-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableWrap } from "@/components/ui/table";
import { INVOICE_KINDS, INVOICE_STATUSES, invoices, PAYMENT_STATUSES, type InvoiceKind, type InvoiceStatus, type PaymentStatus } from "@/db/tenant-schema";
import { newInvoice, saveNextInvoiceNumber } from "@/lib/actions/invoices";
import { requireContext } from "@/lib/auth";
import { localTodayIso } from "@/lib/dates";
import { INVOICE_STATUS_LABELS, KIND_TITLES, PAYMENT_LABELS, PAYMENT_TONES } from "@/lib/invoicing";
import { peekInvoiceNumber } from "@/lib/numbering";
import { pageParam, param, type SearchParams } from "@/lib/paging";
import { can } from "@/lib/permissions";
import { listPartners, pageInvoices } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Фактури" };

const isDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const oneOf = <T extends string>(v: string, all: readonly T[]) => ((all as readonly string[]).includes(v) ? (v as T) : undefined);

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const today = localTodayIso();
  const filters = {
    q: param(sp, "q") || undefined,
    kind: oneOf<InvoiceKind>(param(sp, "kind"), INVOICE_KINDS),
    status: oneOf<InvoiceStatus>(param(sp, "status"), INVOICE_STATUSES),
    payment: param(sp, "payment") === "overdue" ? ("overdue" as const) : oneOf<PaymentStatus>(param(sp, "payment"), PAYMENT_STATUSES),
    from: isDate(param(sp, "from")),
    to: isDate(param(sp, "to")),
  };
  const [{ rows, total, page, pageSize }, customers, nextNumber, [issued]] = await Promise.all([
    pageInvoices(ctx.db, filters, pageParam(sp), today),
    listPartners(ctx.db),
    peekInvoiceNumber(ctx.db),
    ctx.db.select({ id: invoices.id }).from(invoices).where(eq(invoices.status, "issued")).limit(1),
  ]);
  const filtered = Object.values(filters).some((v) => v !== undefined);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const writable = can(ctx.role, "write");

  return (
    <>
      <PageHeader title="Фактури" description="Фактури, кредитни и дебитни известия по ЗДДС и проформи. Издаденият документ получава пореден десетразряден номер и не се променя." />
      <FilterBar action="/invoices" resetHref={filtered ? "/invoices" : undefined}>
        <div className="min-w-52 flex-1">
          <Input name="q" placeholder="Номер, получател или ЕИК…" defaultValue={filters.q} />
        </div>
        <Select name="kind" defaultValue={filters.kind ?? ""} className="w-auto" aria-label="Вид">
          <option value="">Всички видове</option>
          {INVOICE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_TITLES[k]}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status ?? ""} className="w-auto" aria-label="Статус">
          <option value="">Всички статуси</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INVOICE_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select name="payment" defaultValue={filters.payment ?? ""} className="w-auto" aria-label="Плащане">
          <option value="">Всички плащания</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PAYMENT_LABELS[s]}
            </option>
          ))}
          <option value="overdue">Просрочени</option>
        </Select>
        <Input name="from" type="date" defaultValue={filters.from} className="w-auto" aria-label="От дата" />
        <Input name="to" type="date" defaultValue={filters.to} className="w-auto" aria-label="До дата" />
      </FilterBar>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div>
          {rows.length === 0 ? (
            <Card>
              <EmptyState icon={FileText} title={filtered ? "Няма документи по тези филтри" : "Все още няма фактури"} description="Създайте фактура от клиентска поръчка или празна чернова вдясно." />
            </Card>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>Вид</th>
                    <th>Получател</th>
                    <th>Дата</th>
                    <th>Падеж</th>
                    <th>Статус</th>
                    <th className="text-right">Сума</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ invoice: inv, partnerName }) => {
                    const overdue = inv.status === "issued" && inv.paymentStatus !== "paid" && (inv.kind === "invoice" || inv.kind === "debit_note") && inv.dueDate !== null && inv.dueDate < today;
                    return (
                      <tr key={inv.id}>
                        <td>
                          <Link href={`/invoices/${inv.id}`} className="font-mono font-medium hover:text-accent">
                            {inv.number ?? "чернова"}
                          </Link>
                        </td>
                        <td className="text-muted">{KIND_TITLES[inv.kind]}</td>
                        <td>{inv.recipientName ?? partnerName ?? "—"}</td>
                        <td className="text-muted">{formatDate(inv.issueDate)}</td>
                        <td className={overdue ? "font-medium text-danger" : "text-muted"}>{formatDate(inv.dueDate)}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <Badge tone={inv.status === "issued" ? "success" : inv.status === "cancelled" ? "danger" : "neutral"}>{INVOICE_STATUS_LABELS[inv.status]}</Badge>
                            {inv.status === "issued" && (inv.kind === "invoice" || inv.kind === "debit_note") && <Badge tone={overdue ? "danger" : PAYMENT_TONES[inv.paymentStatus]}>{overdue ? "Просрочена" : PAYMENT_LABELS[inv.paymentStatus]}</Badge>}
                          </div>
                        </td>
                        <td className="text-right tabular-nums">
                          {inv.kind === "credit_note" ? "−" : ""}
                          {money(inv.grossTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
          <Pagination basePath="/invoices" searchParams={sp} page={page} pageSize={pageSize} total={total} noun="документа" />
        </div>

        <div className="space-y-6">
          {writable && (
            <Card className="h-fit">
              <CardHeader title="Нова чернова" description="От клиентска поръчка — бутонът „Фактура“ в поръчката." />
              <CardBody>
                <Form action={newInvoice} className="space-y-3">
                  <Field label="Вид">
                    <Select name="kind" defaultValue="invoice">
                      <option value="invoice">Фактура</option>
                      <option value="proforma">Проформа</option>
                    </Select>
                  </Field>
                  <Field label="Получател">
                    <Select name="partnerId" defaultValue="">
                      <option value="">— избира се в черновата —</option>
                      {customers
                        .filter((p) => p.type !== "supplier")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <SubmitButton className="w-full">
                    <Plus className="h-4 w-4" /> Създай
                  </SubmitButton>
                </Form>
              </CardBody>
            </Card>
          )}
          <Card className="h-fit">
            <CardHeader title="Номерация" description={`Следващата фактура или известие: № ${nextNumber}.`} />
            {!issued && can(ctx.role, "manage") && (
              <CardBody>
                <Form action={saveNextInvoiceNumber} className="space-y-3">
                  <Field label="Продължете от предишния софтуер" hint="Само преди първата издадена фактура.">
                    <Input name="next" type="number" min={1} defaultValue={Number(nextNumber)} required />
                  </Field>
                  <SubmitButton variant="secondary" className="w-full">
                    Задай следващия номер
                  </SubmitButton>
                </Form>
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
