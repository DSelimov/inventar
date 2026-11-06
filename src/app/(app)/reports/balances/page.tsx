import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/search-form";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrap } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { partnerBalances } from "@/lib/cash";
import { sumMoney } from "@/lib/money";
import { param, type SearchParams } from "@/lib/paging";
import { listPartners } from "@/lib/queries";
import { cn, formatMoney } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";

export const metadata: Metadata = { title: "Салда по партньори" };

export default async function BalancesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const showAll = param(sp, "all") === "1";
  const [partners, balances] = await Promise.all([listPartners(ctx.db), partnerBalances(ctx.db)]);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const rows = partners
    .map((p) => ({ partner: p, b: balances.get(p.id) }))
    .filter((r) => showAll || (r.b && (r.b.receivable !== 0 || r.b.payable !== 0)))
    .sort((a, b) => (b.b?.receivable ?? 0) - (a.b?.receivable ?? 0) || (b.b?.payable ?? 0) - (a.b?.payable ?? 0));
  const receivable = sumMoney(rows.map((r) => Math.max(0, r.b?.receivable ?? 0)));
  const payable = sumMoney(rows.map((r) => Math.max(0, r.b?.payable ?? 0)));

  return (
    <>
      <PageHeader
        title="Салда по партньори"
        back={{ href: "/reports", label: "Отчети" }}
        description="Вземания от клиенти (фактури и продажби без фактура минус платеното) и задължения към доставчици (получена стока минус платеното). Отрицателно = аванс."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Дължат ни" value={money(receivable)} icon={ArrowDownLeft} tone={receivable > 0 ? "danger" : "neutral"} />
        <StatCard label="Дължим" value={money(payable)} icon={ArrowUpRight} tone={payable > 0 ? "warning" : "neutral"} />
        <StatCard label="Нето" value={money(sumMoney([receivable, -payable]))} icon={Scale} tone="accent" />
      </div>
      <FilterBar action="/reports/balances" resetHref={showAll ? "/reports/balances" : undefined}>
        <Checkbox name="all" value="1" defaultChecked={showAll} label="Покажи и партньорите с нулево салдо" />
      </FilterBar>
      <Card>
        {rows.length === 0 ? (
          <CardBody className="text-sm text-muted">Няма неуредени салда.</CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Партньор</th>
                  <th className="text-right">Дължи ни</th>
                  <th className="text-right">Дължим</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ partner, b }) => (
                  <tr key={partner.id}>
                    <td>
                      <Link href={`/partners/${partner.id}`} className="font-medium hover:text-accent">
                        {partner.name}
                      </Link>
                      {partner.eik && <div className="font-mono text-xs text-muted">{partner.eik}</div>}
                    </td>
                    <td className={cn("text-right tabular-nums", (b?.receivable ?? 0) > 0 && "font-semibold text-danger")}>{b?.receivable ? money(b.receivable) : "—"}</td>
                    <td className={cn("text-right tabular-nums", (b?.payable ?? 0) > 0 && "font-semibold text-warning")}>{b?.payable ? money(b.payable) : "—"}</td>
                    <td className="text-right">{(b?.overdueInvoices ?? 0) > 0 && <Badge tone="danger">{b!.overdueInvoices} просрочени</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
