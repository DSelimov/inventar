import type { Metadata } from "next";
import { Download } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/search-form";
import { Table } from "@/components/ui/table";
import { purchasesList, RATES, salesJournal } from "@/lib/accounting";
import { requireContext } from "@/lib/auth";
import { localTodayIso } from "@/lib/dates";
import { param, type SearchParams } from "@/lib/paging";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "За счетоводителя" };

/** Последният ден на месеца на дата ГГГГ-ММ-ДД. */
const monthEnd = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export default async function AccountingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  // по подразбиране — предишният месец (обичайното предаване на документите)
  const today = localTodayIso();
  const [y, m] = today.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const month = /^\d{4}-\d{2}$/.test(param(sp, "month")) ? `${param(sp, "month")}-01` : prev;
  const from = month;
  const to = monthEnd(month);
  const [sales, purchases] = await Promise.all([salesJournal(ctx.db, from, to), purchasesList(ctx.db, from, to)]);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const qs = `from=${from}&to=${to}`;

  return (
    <>
      <PageHeader help="valuation"
        title="За счетоводителя"
        description={`Документи за ${formatDate(from, "LLLL yyyy")}: издадени фактури и известия с основа и ДДС по ставка, и получените доставки. Файловете са CSV за Excel.`}
        back={{ href: "/reports", label: "Отчети" }}
      />
      <FilterBar action="/reports/accounting">
        <label className="text-xs text-muted">
          Месец
          <Input name="month" type="month" defaultValue={month.slice(0, 7)} className="mt-1 w-auto" />
        </label>
      </FilterBar>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Продажби (ДДС)"
            description={`${sales.rows.length} документа · ДДС за периода ${money(sales.vat)}`}
            actions={
              <a href={`/api/export/sales-journal?${qs}`} className={buttonClasses("secondary", "sm")}>
                <Download className="h-4 w-4" /> CSV
              </a>
            }
          />
          <Table>
            <thead>
              <tr>
                <th>Ставка</th>
                <th className="text-right">Данъчна основа</th>
                <th className="text-right">ДДС</th>
              </tr>
            </thead>
            <tbody>
              {RATES.map((r) => (
                <tr key={r}>
                  <td>{r} %</td>
                  <td className="text-right tabular-nums">{money(sales.totals[r].net)}</td>
                  <td className="text-right tabular-nums">{money(sales.totals[r].vat)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Общо с ДДС</td>
                <td />
                <td className="text-right tabular-nums">{money(sales.gross)}</td>
              </tr>
            </tbody>
          </Table>
          <CardBody className="text-xs text-muted">Кредитните известия са с минус; анулираните документи са в списъка с нули. Проформите не влизат.</CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Доставки"
            description={`${purchases.rows.length} пратки · ${money(purchases.total)} без ДДС`}
            actions={
              <a href={`/api/export/purchases?${qs}`} className={buttonClasses("secondary", "sm")}>
                <Download className="h-4 w-4" /> CSV
              </a>
            }
          />
          <CardBody className="text-sm text-muted">
            Получените пратки по себестойност (връщанията към доставчик с минус). Фактурите на доставчиците не се водят в системата — номерът им може да е в референцията на пратката.
          </CardBody>
        </Card>
      </div>
    </>
  );
}
