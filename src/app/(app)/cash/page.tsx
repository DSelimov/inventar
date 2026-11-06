import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Landmark, Plus, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Field, Input, Select } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/search-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableWrap } from "@/components/ui/table";
import { addCashEntry, createCashAccount, reverseCashEntryAction, updateCashAccount } from "@/lib/actions/cash";
import { requireContext } from "@/lib/auth";
import { accountBalances, CASH_CATEGORIES, pageCashEntries } from "@/lib/cash";
import { localTodayIso } from "@/lib/dates";
import { pageParam, param, type SearchParams } from "@/lib/paging";
import { can } from "@/lib/permissions";
import { listPartners } from "@/lib/queries";
import { cn, formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Каса и банка" };

export default async function CashPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const accountId = Number(param(sp, "account")) || null;
  const direction = param(sp, "direction") === "in" || param(sp, "direction") === "out" ? (param(sp, "direction") as "in" | "out") : null;
  const from = param(sp, "from") || null;
  const to = param(sp, "to") || null;
  const partnerId = Number(param(sp, "partner")) || null;
  const page = pageParam(sp);
  const [accounts, entries, partners] = await Promise.all([accountBalances(ctx.db), pageCashEntries(ctx.db, { accountId, direction, from, to, partnerId }, page), listPartners(ctx.db)]);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const writable = can(ctx.role, "write");
  const manage = can(ctx.role, "manage");
  const active = accounts.filter((a) => a.active);
  const filtered = Boolean(accountId || direction || from || to || partnerId);

  return (
    <>
      <PageHeader title="Каса и банка" description="Всички постъпления и плащания: по фактури, по поръчки, аванси и други приходи и разходи. Касовите записи са с пореден ПКО/РКО." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {active.map((a) => (
          <Link key={a.id} href={`/cash?account=${a.id}`} className={cn("rounded-lg border bg-surface p-5 transition hover:border-accent/40", accountId === a.id ? "border-accent" : "border-line")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">{a.name}</span>
              {a.kind === "cash" ? <Banknote className="h-5 w-5 text-success" /> : <Landmark className="h-5 w-5 text-info" />}
            </div>
            <div className={cn("mt-2 text-xl font-semibold tabular-nums", a.balance < 0 && "text-danger")}>{money(a.balance)}</div>
            <div className="mt-1 text-xs text-muted tabular-nums">
              +{money(a.inflow)} · −{money(a.outflow)}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <FilterBar action="/cash" resetHref={filtered ? "/cash" : undefined}>
            <Select name="account" defaultValue={accountId ?? ""} className="w-auto">
              <option value="">Всички сметки</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select name="direction" defaultValue={direction ?? ""} className="w-auto">
              <option value="">Приходи и разходи</option>
              <option value="in">Само приходи</option>
              <option value="out">Само разходи</option>
            </Select>
            <Input name="from" type="date" defaultValue={from ?? ""} className="w-auto" aria-label="От дата" />
            <Input name="to" type="date" defaultValue={to ?? ""} className="w-auto" aria-label="До дата" />
            <Select name="partner" defaultValue={partnerId ?? ""} className="w-auto">
              <option value="">Всички партньори</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FilterBar>

          <Card>
            {entries.rows.length === 0 ? (
              <CardBody className="text-sm text-muted">Няма записи{filtered ? " по този филтър" : ". Плащанията по фактури и от картата на партньора се записват тук автоматично"}.</CardBody>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Документ</th>
                      <th>Основание</th>
                      <th className="text-right">Сума</th>
                      {manage && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.rows.map((e) => {
                      const dead = Boolean(e.reversedAt || e.reversalOfId);
                      return (
                        <tr key={e.id} className={cn(dead && "text-muted")}>
                          <td className="whitespace-nowrap tabular-nums">{formatDate(e.entryDate)}</td>
                          <td className="whitespace-nowrap">
                            <div className="font-mono text-xs">{e.number ?? "—"}</div>
                            <div className="text-xs text-muted">{e.account?.name}</div>
                          </td>
                          <td className="min-w-48">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {e.category && <span className="font-medium">{e.category}</span>}
                              {e.reversedAt && <Badge tone="neutral">сторниран</Badge>}
                            </div>
                            <div className="text-xs text-muted">
                              {e.partner && (
                                <Link href={`/partners/${e.partner.id}`} className="hover:text-accent">
                                  {e.partner.name}
                                </Link>
                              )}
                              {e.invoice && (
                                <>
                                  {" · "}
                                  <Link href={`/invoices/${e.invoice.id}`} className="hover:text-accent">
                                    фактура {e.invoice.number}
                                  </Link>
                                </>
                              )}
                              {e.order && (
                                <>
                                  {" · "}
                                  <Link href={`/orders/${e.order.id}`} className="hover:text-accent">
                                    поръчка {e.order.number}
                                  </Link>
                                </>
                              )}
                              {e.note && <> · {e.note}</>}
                            </div>
                          </td>
                          <td className={cn("whitespace-nowrap text-right font-semibold tabular-nums", !dead && (e.direction === "in" ? "text-success" : "text-danger"))}>
                            {e.direction === "in" ? "+" : "−"}
                            {money(e.amount)}
                          </td>
                          {manage && (
                            <td className="text-right">
                              {!dead && !e.invoiceId && (
                                <Form action={reverseCashEntryAction.bind(null, e.id)}>
                                  <ConfirmButton variant="ghost" size="sm" message={`Да сторнирам ли ${e.number ?? "записа"} за ${money(e.amount)}? Създава се обратен запис.`} aria-label="Сторно">
                                    <Undo2 className="h-3.5 w-3.5" />
                                  </ConfirmButton>
                                </Form>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
          <Pagination basePath="/cash" searchParams={sp} page={entries.page} pageSize={entries.pageSize} total={entries.total} noun="записа" />
        </div>

        <div className="space-y-6">
          {writable && active.length > 0 && (
            <Card>
              <CardHeader title="Нов запис" description="Приход или разход без документ: внасяне, теглене, наем, аванс." />
              <CardBody>
                <Form action={addCashEntry} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Вид">
                      <Select name="direction" defaultValue="in">
                        <option value="in">Приход (+)</option>
                        <option value="out">Разход (−)</option>
                      </Select>
                    </Field>
                    <Field label="Сметка">
                      <Select name="accountId" defaultValue={active.find((a) => a.isDefault)?.id ?? active[0]?.id}>
                        {active.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Сума">
                      <Input name="amount" type="number" min={0.01} step="0.01" required />
                    </Field>
                    <Field label="Дата">
                      <Input name="entryDate" type="date" defaultValue={localTodayIso()} />
                    </Field>
                  </div>
                  <Field label="Основание">
                    <Input name="category" list="cash-categories" placeholder="Разход, внасяне, аванс…" />
                    <datalist id="cash-categories">
                      {[...CASH_CATEGORIES.in, ...CASH_CATEGORIES.out].map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Партньор" hint="По избор. Плащане по документи — от картата на партньора.">
                    <Select name="partnerId" defaultValue="">
                      <option value="">— без партньор —</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Бележка">
                    <Input name="note" />
                  </Field>
                  <SubmitButton className="w-full">
                    <Plus className="h-4 w-4" /> Запиши
                  </SubmitButton>
                </Form>
              </CardBody>
            </Card>
          )}

          {manage && (
            <Card>
              <CardHeader title="Каси и сметки" />
              <CardBody className="space-y-4">
                {accounts.map((a) => (
                  <Form key={a.id} action={updateCashAccount.bind(null, a.id)} className="space-y-2 border-b border-line pb-4 last:border-0 last:pb-0">
                    <div className="flex gap-2">
                      <Input name="name" defaultValue={a.name} required aria-label="Име" />
                      <SubmitButton variant="secondary" size="sm">
                        Запази
                      </SubmitButton>
                    </div>
                    {a.kind === "bank" && <Input name="iban" defaultValue={a.iban ?? ""} placeholder="IBAN" className="font-mono" aria-label="IBAN" />}
                    <div className="flex flex-wrap gap-3">
                      <Checkbox name="active" defaultChecked={a.active} label="Активна" />
                      <Checkbox name="isDefault" defaultChecked={a.isDefault} label="По подразбиране" />
                    </div>
                  </Form>
                ))}
                <Form action={createCashAccount} className="space-y-2 rounded-lg bg-surface-2 p-3">
                  <div className="text-xs font-medium text-muted">Нова каса или сметка</div>
                  <div className="flex gap-2">
                    <Select name="kind" defaultValue="bank" className="w-28" aria-label="Вид">
                      <option value="cash">Каса</option>
                      <option value="bank">Банка</option>
                    </Select>
                    <Input name="name" required placeholder="напр. ОББ" aria-label="Име" />
                  </div>
                  <Input name="iban" placeholder="IBAN (за банка)" className="font-mono" aria-label="IBAN" />
                  <SubmitButton variant="secondary" size="sm" className="w-full">
                    <Plus className="h-4 w-4" /> Добави
                  </SubmitButton>
                </Form>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
