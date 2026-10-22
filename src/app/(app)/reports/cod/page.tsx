import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, gte, isNotNull } from "drizzle-orm";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/search-form";
import { Table } from "@/components/ui/table";
import { shipments } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { localTodayIso, startOfLocalDay } from "@/lib/dates";
import { sumMoney } from "@/lib/money";
import { param, type SearchParams } from "@/lib/paging";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Наложени платежи" };

/** Сверка на наложените платежи: заявено при товарителницата, събрано от куриера, изплатено. */
export default async function CodPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "from")) ? param(sp, "from") : `${localTodayIso().slice(0, 7)}-01`;
  const rows = await ctx.db.select().from(shipments).where(and(isNotNull(shipments.codAmount), gte(shipments.createdAt, startOfLocalDay(from)))).orderBy(desc(shipments.createdAt));
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const expected = sumMoney(rows.map((r) => r.codAmount ?? 0));
  const collected = sumMoney(rows.map((r) => r.codCollectedAmount ?? 0));
  const paid = sumMoney(rows.filter((r) => r.codPaidAt).map((r) => r.codCollectedAmount ?? 0));

  return (
    <>
      <PageHeader title="Наложени платежи" description={`Товарителници с наложен платеж от ${formatDate(from)}: заявено ${money(expected)} · събрано ${money(collected)} · изплатено от куриера ${money(paid)}.`} back={{ href: "/reports", label: "Отчети" }} />
      <FilterBar action="/reports/cod">
        <label className="text-xs text-muted">
          От дата
          <Input name="from" type="date" defaultValue={from} className="mt-1 w-auto" />
        </label>
      </FilterBar>
      <Card>
        <CardHeader title={`${rows.length} товарителници`} description="Събраното и изплатеното се обновяват при проверката на статусите (Еконт ги връща; при Спиди и BOX NOW — от справката на куриера)." />
        <Table>
          <thead>
            <tr>
              <th>Пратка</th>
              <th>Куриер</th>
              <th>Статус</th>
              <th className="text-right">Заявено</th>
              <th className="text-right">Събрано</th>
              <th>Изплатено</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/shipments/${r.id}`} className="font-medium hover:text-accent">
                    {r.reference}
                  </Link>
                  <div className="font-mono text-xs text-muted">{r.trackingNumber}</div>
                </td>
                <td>{r.carrier}</td>
                <td className="text-muted">{r.carrierStatus ?? "—"}</td>
                <td className="text-right tabular-nums">{money(r.codAmount ?? 0)}</td>
                <td className="text-right tabular-nums">{r.codCollectedAmount ? money(r.codCollectedAmount) : "—"}</td>
                <td className="text-muted">{r.codPaidAt ? formatDate(r.codPaidAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
