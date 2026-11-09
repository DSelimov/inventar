import Link from "next/link";
import type { Metadata } from "next";
import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ArrowDownToLine, ArrowUpFromLine, Download, History, Package, Printer } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/search-form";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrap } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { localTodayIso } from "@/lib/dates";
import { MOVEMENT_TYPE_OPTIONS, movementReport, movementReportQuery, readMovementReportFilters } from "@/lib/movement-report";
import type { SearchParams } from "@/lib/paging";
import { listCategories, listLocationsFor } from "@/lib/queries";
import { cn, formatDate, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Приход и разход за период" };

export default async function MovementReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const f = readMovementReportFilters(sp, ctx.locations);
  const [report, locations, categories] = await Promise.all([movementReport(ctx.db, f), listLocationsFor(ctx), listCategories(ctx.db)]);
  const showValues = !ctx.hideCosts;
  const money = (v: number) => formatMoney(v, ctx.org.currency);

  // бързи периоди
  const today = parseISO(localTodayIso());
  const d = (x: Date) => format(x, "yyyy-MM-dd");
  const lastMonth = subMonths(today, 1);
  const ranges = [
    { label: "Днес", from: d(today), to: d(today) },
    { label: "Вчера", from: d(addDays(today, -1)), to: d(addDays(today, -1)) },
    { label: "Тази седмица", from: d(startOfWeek(today, { weekStartsOn: 1 })), to: d(today) },
    { label: "Този месец", from: d(startOfMonth(today)), to: d(today) },
    { label: "Миналия месец", from: d(startOfMonth(lastMonth)), to: d(endOfMonth(lastMonth)) },
    { label: "Последните 30 дни", from: d(addDays(today, -29)), to: d(today) },
  ];
  const period = f.from === f.to ? formatDate(f.from, "d MMMM yyyy") : `${formatDate(f.from, "d MMM yyyy")} – ${formatDate(f.to, "d MMM yyyy")}`;
  const query = movementReportQuery(f);
  const detailHref = (itemId: number) => {
    const p = new URLSearchParams({ item: String(itemId), from: f.from, to: f.to });
    if (f.locationId) p.set("location", String(f.locationId));
    if (f.type) p.set("type", f.type);
    return `/movements?${p}`;
  };
  const cols = showValues ? 9 : 6;

  return (
    <div>
      <PageHeader
        help="reports"
        title="Приход и разход за период"
        description={`Какво е получено и изписано по артикул: начално количество, приход, разход и крайно количество. ${period}.`}
        back={{ href: "/reports", label: "Отчети" }}
        actions={
          <>
            <a href={`/api/export/movement-report?${query}`} className={buttonClasses("secondary")}>
              <Download className="h-4 w-4" /> CSV
            </a>
            <a href={`/print/movements?${query}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
              <Printer className="h-4 w-4" /> Печат (PDF)
            </a>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
        {ranges.map((r) => {
          const active = r.from === f.from && r.to === f.to;
          return (
            <Link
              key={r.label}
              href={`/reports/movements?${movementReportQuery({ ...f, from: r.from, to: r.to })}`}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", active ? "bg-accent text-white" : "text-accent hover:bg-surface-2")}
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      <FilterBar action="/reports/movements" resetHref={query !== movementReportQuery({ ...f, locationId: null, categoryId: null, type: null, direction: null, q: null }) ? `/reports/movements?from=${f.from}&to=${f.to}` : undefined}>
        <label className="text-sm">
          <span className="mb-1 block font-bold">От</span>
          <Input name="from" type="date" defaultValue={f.from} className="w-auto" required />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-bold">До</span>
          <Input name="to" type="date" defaultValue={f.to} className="w-auto" required />
        </label>
        <Select name="direction" defaultValue={f.direction ?? ""} className="w-auto" aria-label="Посока">
          <option value="">Приход и разход</option>
          <option value="in">Само приход</option>
          <option value="out">Само разход</option>
        </Select>
        <Select name="type" defaultValue={f.type ?? ""} className="w-auto" aria-label="Вид движение">
          <option value="">Всички видове движения</option>
          {MOVEMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {locations.length > 1 && (
          <Select name="location" defaultValue={f.locationId ?? ""} className="w-auto" aria-label="Локация">
            <option value="">Всички локации</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <Select name="category" defaultValue={f.categoryId ?? ""} className="w-auto" aria-label="Категория">
          <option value="">Всички категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="min-w-48 flex-1">
          <Input name="q" placeholder="Артикул, код, баркод…" defaultValue={f.q ?? ""} />
        </div>
      </FilterBar>

      <div className={cn("mb-5 grid grid-cols-2 gap-3", showValues ? "lg:grid-cols-4" : "lg:grid-cols-2")}>
        <StatCard label="Артикули с движение" value={formatNumber(report.totals.items)} icon={Package} />
        <StatCard label="Движения" value={formatNumber(report.totals.moves)} icon={History} />
        {showValues && <StatCard label="Получено (себестойност)" value={money(report.totals.inValue)} icon={ArrowDownToLine} tone="success" />}
        {showValues && <StatCard label="Изписано (себестойност)" value={money(report.totals.outValue)} icon={ArrowUpFromLine} />}
      </div>

      <TableWrap>
        {report.rows.length === 0 ? (
          <EmptyState icon={History} title="Няма движения за периода" description="Изберете друг период или махнете част от филтрите." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Артикул</th>
                <th>М.е.</th>
                <th className="text-right">Начално</th>
                <th className="text-right">Получено</th>
                <th className="text-right">Изписано</th>
                <th className="text-right">Крайно</th>
                {showValues && <th className="text-right">Стойност приход</th>}
                {showValues && <th className="text-right">Стойност разход</th>}
                {showValues && <th className="text-right">Крайна стойност</th>}
              </tr>
            </thead>
            {report.groups.map((g) => (
              <tbody key={g.categoryId ?? 0}>
                <tr>
                  <td colSpan={cols} className="bg-surface-2 font-bold">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: g.color ?? "#999999" }} />
                    {g.name} <span className="font-normal text-muted">· {g.totals.items} арт.</span>
                  </td>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.itemId}>
                    <td>
                      <Link href={detailHref(r.itemId)} className="text-accent hover:underline" title="Движенията на артикула за периода">
                        {r.name}
                        {r.variant && <span className="text-muted"> · {r.variant}</span>}
                      </Link>
                      <div className="font-mono text-xs text-muted">{r.sku}</div>
                    </td>
                    <td className="text-muted">{r.unit}</td>
                    <td className="text-right tabular-nums">{formatNumber(r.openingQty)}</td>
                    <td className="text-right tabular-nums text-success">{r.inQty ? `+${formatNumber(r.inQty)}` : "—"}</td>
                    <td className="text-right tabular-nums text-danger">{r.outQty ? `−${formatNumber(r.outQty)}` : "—"}</td>
                    <td className="text-right font-bold tabular-nums">{formatNumber(r.closingQty)}</td>
                    {showValues && <td className="text-right tabular-nums">{r.inValue ? money(r.inValue) : "—"}</td>}
                    {showValues && <td className="text-right tabular-nums">{r.outValue ? money(r.outValue) : "—"}</td>}
                    {showValues && <td className="text-right tabular-nums">{money(r.closingValue)}</td>}
                  </tr>
                ))}
                {showValues && (
                  <tr className="text-muted">
                    <td colSpan={6} className="text-right text-sm">
                      Общо „{g.name}“
                    </td>
                    <td className="text-right tabular-nums">{money(g.totals.inValue)}</td>
                    <td className="text-right tabular-nums">{money(g.totals.outValue)}</td>
                    <td className="text-right tabular-nums">{money(g.totals.closingValue)}</td>
                  </tr>
                )}
              </tbody>
            ))}
            {showValues && (
              <tfoot>
                <tr className="border-t-2 border-line font-bold">
                  <td colSpan={6} className="px-3 py-2 text-right">
                    Общо за периода
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(report.totals.inValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(report.totals.outValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(report.totals.closingValue)}</td>
                </tr>
              </tfoot>
            )}
          </Table>
        )}
      </TableWrap>
      {f.type && <p className="mt-3 text-xs text-muted">„Получено“ и „Изписано“ показват само избрания вид движение; началното и крайното количество са от всички движения.</p>}
    </div>
  );
}
