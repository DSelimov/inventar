import type { Metadata } from "next";
import { Coins, Printer, Receipt, TrendingUp } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/search-form";
import { StatCard } from "@/components/ui/stat-card";
import { Table } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { localTodayIso } from "@/lib/dates";
import { param, type SearchParams } from "@/lib/paging";
import { listLocations } from "@/lib/queries";
import { getValuationMethod } from "@/lib/valuation";
import { salesMargin, stockValueAt } from "@/lib/valuation-reports";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Себестойност и марж" };

const isDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const LIMIT = 200;

export default async function ValuationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const today = localTodayIso();
  const at = isDate(param(sp, "at")) ?? today;
  const from = isDate(param(sp, "from")) ?? `${today.slice(0, 8)}01`;
  const to = isDate(param(sp, "to")) ?? today;
  const locationId = Number(param(sp, "location")) || null;
  const [stock, sales, locations, method] = await Promise.all([stockValueAt(ctx.db, at, { locationId }), salesMargin(ctx.db, from, to), listLocations(ctx.db, true), getValuationMethod(ctx.db)]);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const pct = (v: number) => `${v.toFixed(1)} %`;
  const pdf = `/print/stock?date=${at}${locationId ? `&location=${locationId}` : ""}`;

  return (
    <>
      <PageHeader
        title="Себестойност и марж"
        description={`Оценка по ${method === "fifo" ? "FIFO (първа входяща, първа изходяща)" : "средно претеглена цена"}. Стойността е от складовите движения; приходът — по цените от поръчките.`}
        back={{ href: "/reports", label: "Отчети" }}
        actions={
          <a href={pdf} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
            <Printer className="h-4 w-4" /> Наличност към {formatDate(at, "dd.MM.yyyy")} (PDF)
          </a>
        }
      />

      <FilterBar action="/reports/valuation">
        <label className="text-xs text-muted">
          Наличност към
          <Input name="at" type="date" defaultValue={at} className="mt-1 w-auto" />
        </label>
        {locations.length > 1 && (
          <Select name="location" defaultValue={locationId ?? ""} className="w-auto" aria-label="Локация">
            <option value="">Всички локации</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <label className="text-xs text-muted">
          Продажби от
          <Input name="from" type="date" defaultValue={from} className="mt-1 w-auto" />
        </label>
        <label className="text-xs text-muted">
          до
          <Input name="to" type="date" defaultValue={to} className="mt-1 w-auto" />
        </label>
      </FilterBar>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Стойност към ${formatDate(at, "dd.MM.yyyy")}`} value={money(stock.total)} hint={`${formatNumber(stock.rows.length)} артикула`} icon={Coins} tone="accent" />
        <StatCard label="Приходи" value={money(sales.totals.revenue)} hint={`${formatDate(from, "dd.MM")} – ${formatDate(to, "dd.MM.yyyy")}`} icon={Receipt} />
        <StatCard label="Себестойност на продажбите" value={money(sales.totals.cost)} hint="изписано по продажби минус върнатото" icon={Coins} />
        <StatCard label="Брутен марж" value={money(sales.totals.margin)} hint={pct(sales.totals.marginPct)} icon={TrendingUp} tone={sales.totals.margin >= 0 ? "success" : "danger"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <MarginTable title="Марж по артикул" rows={sales.items.map((r) => ({ ...r, label: r.variant ? `${r.name} · ${r.variant}` : r.name, sub: `${r.sku} · ${formatNumber(r.quantity)} ${r.unit}` }))} money={money} pct={pct} />
        <MarginTable title="Марж по клиент" rows={sales.partners.map((r) => ({ ...r, label: r.name, sub: `${formatNumber(r.quantity)} единици` }))} money={money} pct={pct} />
      </div>

      <Card className="mt-6">
        <CardHeader title={`Наличност към ${formatDate(at, "dd.MM.yyyy")}`} description={stock.rows.length > LIMIT ? `Показани са първите ${LIMIT} от ${stock.rows.length}; пълният списък е в PDF.` : "Количество и стойност от движенията до края на деня."} />
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Категория</th>
                <th className="text-right">Количество</th>
                <th className="text-right">Стойност</th>
              </tr>
            </thead>
            <tbody>
              {stock.rows.slice(0, LIMIT).map((r) => (
                <tr key={r.itemId}>
                  <td>
                    <div className="font-medium">{r.variant ? `${r.name} · ${r.variant}` : r.name}</div>
                    <div className="text-xs text-muted">{r.sku}</div>
                  </td>
                  <td className="text-muted">{r.category ?? "—"}</td>
                  <td className="text-right tabular-nums">
                    {formatNumber(r.quantity)} {r.unit}
                  </td>
                  <td className="text-right tabular-nums font-medium">{money(r.value)}</td>
                </tr>
              ))}
              {!stock.rows.length && (
                <tr>
                  <td colSpan={4} className="text-center text-muted">
                    Няма наличност към тази дата.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card>
    </>
  );
}

function MarginTable({ title, rows, money, pct }: { title: string; rows: Array<{ label: string; sub: string; revenue: number; cost: number; margin: number; marginPct: number }>; money: (v: number) => string; pct: (v: number) => string }) {
  return (
    <Card>
      <CardHeader title={title} description={rows.length ? `${rows.length} реда` : "Няма доставени продажби в периода."} />
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <th></th>
              <th className="text-right">Приход</th>
              <th className="text-right">Себестойност</th>
              <th className="text-right">Марж</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, LIMIT).map((r) => (
              <tr key={`${r.label}-${r.sub}`}>
                <td>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-muted">{r.sub}</div>
                </td>
                <td className="text-right tabular-nums">{money(r.revenue)}</td>
                <td className="text-right tabular-nums text-muted">{money(r.cost)}</td>
                <td className={`text-right tabular-nums ${r.margin < 0 ? "text-danger" : ""}`}>
                  {money(r.margin)}
                  <div className="text-xs text-muted">{pct(r.marginPct)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
