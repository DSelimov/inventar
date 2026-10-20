import Link from "next/link";
import type { Metadata } from "next";
import { format, subMonths } from "date-fns";
import { Settings2 } from "lucide-react";
import { Badge, ColorBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Table } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { Coins, PackageMinus, RefreshCw, TrendingUp } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildReports } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { LOCALE, formatDate, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Отчети" };

export default async function ReportsPage() {
  const ctx = await requireContext();
  const settings = await getSettings(ctx.db);
  const r = await buildReports(ctx.db, settings);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const marginPct = r.totals.revenue > 0 ? ((r.totals.revenue - r.totals.cost) / r.totals.revenue) * 100 : 0;
  const maxSeries = Math.max(1, ...r.series.map((s) => s.value));
  const maxTurn = Math.max(1, ...r.turnover.map((t) => t.revenue));
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Отчети"
        description={`Анализ за последните ${settings.windowDays} дни (от ${formatDate(r.windowStart)}). Залежала стока: без разход ${settings.deadStockDays} дни. Покритие при поръчка: ${r.coverDays} дни (доставка ${r.avgLead} + буфер ${settings.safetyDays}).`}
        actions={
          can(ctx.role, "manage") && (
            <ButtonLink href="/settings" variant="secondary">
              <Settings2 className="h-4 w-4" /> Параметри
            </ButtonLink>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Стойност на склада" value={money(r.currentValue)} hint={`${formatNumber(r.itemCount)} активни артикула`} icon={Coins} tone="accent" />
        <StatCard label={`Оборот (${settings.windowDays} дни)`} value={money(r.totals.revenue)} hint={`${formatNumber(r.totals.units)} продадени единици`} icon={TrendingUp} tone="success" />
        <StatCard
          label="Брутен марж"
          value={`${marginPct.toFixed(1)} %`}
          hint={`${money(r.totals.revenue - r.totals.cost)} · цел ${settings.targetMarginPct} %`}
          icon={TrendingUp}
          tone={marginPct >= settings.targetMarginPct ? "success" : "warning"}
        />
        <StatCard label="Залежала стока" value={money(r.deadStock.reduce((a, d) => a + d.value, 0))} hint={`${r.deadStock.length} артикула`} icon={PackageMinus} tone={r.deadStock.length ? "warning" : "neutral"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Стойност на склада по месеци" description="По доставна цена, в края на всеки месец; текущият месец = сега." />
          <CardBody>
            <svg viewBox="0 0 480 180" className="h-44 w-full" role="img" aria-label="Стойност на склада по месеци">
              {r.series.map((s, i) => {
                const h = (s.value / maxSeries) * 130;
                const x = 12 + i * 39;
                const isNow = i === r.series.length - 1;
                return (
                  <g key={s.month}>
                    <title>{`${s.month}: ${money(s.value)}`}</title>
                    <rect x={x} y={150 - h} width={26} height={h} rx={4} className={isNow ? "fill-accent" : "fill-accent/60"} />
                    <text x={x + 13} y={168} textAnchor="middle" className="fill-muted text-[10px]">
                      {format(subMonths(now, r.series.length - 1 - i), "LLL", { locale: LOCALE })}
                    </text>
                  </g>
                );
              })}
              <line x1={8} x2={472} y1={150.5} y2={150.5} className="stroke-line" />
            </svg>
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>{money(r.series[0]?.value ?? 0)}</span>
              <span>сега {money(r.currentValue)}</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Оборот и марж по категория" description={`Продадени единици × продажна цена за ${settings.windowDays} дни.`} />
          {r.turnover.every((t) => t.units === 0) ? (
            <CardBody className="text-sm text-muted">Няма разходни движения в периода.</CardBody>
          ) : (
            <CardBody className="space-y-3">
              {r.turnover
                .filter((t) => t.units > 0)
                .map((t) => (
                  <div key={String(t.id)}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <ColorBadge color={t.color}>{t.name}</ColorBadge>
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className="text-muted">{money(t.revenue)}</span>
                        <Badge tone={t.marginPct >= settings.targetMarginPct ? "success" : "warning"}>{t.marginPct.toFixed(0)} %</Badge>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface-2">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (t.revenue / maxTurn) * 100)}%`, backgroundColor: t.color }} />
                    </div>
                  </div>
                ))}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Предложения за поръчка" description={`Средна дневна консумация × ${r.coverDays} дни покритие + минимум − наличност − очаквано от отворени пратки.`} />
          {r.reorder.length === 0 ? (
            <CardBody className="text-sm text-muted">Няма артикули под целевото ниво.</CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th className="text-right">Наличност</th>
                  <th className="text-right">Дневно</th>
                  <th className="text-right">Стига за</th>
                  <th className="text-right">Поръчай</th>
                </tr>
              </thead>
              <tbody>
                {r.reorder.slice(0, 15).map((row) => (
                  <tr key={row.item.id}>
                    <td>
                      <Link href={`/items/${row.item.id}`} className="font-medium hover:text-accent">
                        {row.item.name}
                        {row.item.variantLabel && <span className="text-muted"> · {row.item.variantLabel}</span>}
                      </Link>
                      {row.incoming > 0 && <div className="text-xs text-muted">очаквани {row.incoming}</div>}
                    </td>
                    <td className="text-right tabular-nums">{formatNumber(row.item.quantity)}</td>
                    <td className="text-right tabular-nums text-muted">{row.avgDaily.toFixed(1)}</td>
                    <td className={`text-right tabular-nums ${row.daysLeft !== null && row.daysLeft < r.coverDays ? "text-danger" : "text-muted"}`}>{row.daysLeft === null ? "—" : `${row.daysLeft} дни`}</td>
                    <td className="text-right">
                      <Link href={`/orders/new?type=purchase&item=${row.item.id}`} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-accent hover:underline">
                        <RefreshCw className="h-3 w-3" /> {formatNumber(row.suggest)} {row.item.unit}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Най-продавани" description={`Разход за ${settings.windowDays} дни.`} />
          {r.topMovers.length === 0 ? (
            <CardBody className="text-sm text-muted">Няма разход в периода.</CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th className="text-right">Единици</th>
                  <th className="text-right">Приход</th>
                  <th className="text-right">Марж</th>
                </tr>
              </thead>
              <tbody>
                {r.topMovers.map(({ item, out }) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/items/${item.id}`} className="font-medium hover:text-accent">
                        {item.name}
                        {item.variantLabel && <span className="text-muted"> · {item.variantLabel}</span>}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{formatNumber(out)}</td>
                    <td className="text-right tabular-nums">{money(out * item.unitPrice)}</td>
                    <td className="text-right tabular-nums text-muted">{money(out * (item.unitPrice - item.unitCost))}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Залежала стока" description={`Наличност без разход за ${settings.deadStockDays} дни.`} />
          {r.deadStock.length === 0 ? (
            <CardBody className="text-sm text-muted">Няма залежала стока.</CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th className="text-right">Наличност</th>
                  <th>Последен разход</th>
                  <th className="text-right">Блокирана стойност</th>
                </tr>
              </thead>
              <tbody>
                {r.deadStock.slice(0, 15).map((d) => (
                  <tr key={d.item.id}>
                    <td>
                      <Link href={`/items/${d.item.id}`} className="font-medium hover:text-accent">
                        {d.item.name}
                        {d.item.variantLabel && <span className="text-muted"> · {d.item.variantLabel}</span>}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{formatNumber(d.item.quantity)}</td>
                    <td className="text-muted">{d.lastOut ? formatDate(d.lastOut) : "никога"}</td>
                    <td className="text-right tabular-nums">{money(d.value)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Възраст на наличността" description="Дни от последния приход. Старата стока връзва капитал." />
          <Table>
            <thead>
              <tr>
                <th>Период</th>
                <th className="text-right">Артикули</th>
                <th className="text-right">Единици</th>
                <th className="text-right">Стойност</th>
              </tr>
            </thead>
            <tbody>
              {r.ageing.map((b) => (
                <tr key={b.label}>
                  <td className="font-medium">{b.label}</td>
                  <td className="text-right tabular-nums">{b.items}</td>
                  <td className="text-right tabular-nums">{formatNumber(b.units)}</td>
                  <td className="text-right tabular-nums">{money(b.value)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {r.expiring.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader title="Партиди с изтичащ срок (90 дни)" />
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th>Партида</th>
                  <th>Локация</th>
                  <th>Изтича</th>
                  <th className="text-right">Количество</th>
                </tr>
              </thead>
              <tbody>
                {r.expiring.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/items/${l.itemId}`} className="font-medium hover:text-accent">
                        {l.item.name}
                      </Link>
                    </td>
                    <td className="font-mono text-xs">{l.lotNumber}</td>
                    <td className="text-muted">{l.location.name}</td>
                    <td className={l.expiryDate && l.expiryDate < format(now, "yyyy-MM-dd") ? "text-danger" : ""}>{formatDate(l.expiryDate)}</td>
                    <td className="text-right tabular-nums">{formatNumber(l.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
