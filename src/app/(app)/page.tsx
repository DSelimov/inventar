import Link from "next/link";
import type { Metadata } from "next";
import { addDays, format } from "date-fns";
import { AlertTriangle, ArrowRight, Boxes, CalendarDays, ClipboardList, Coins, MapPin, Package, Timer, Truck } from "lucide-react";
import { Badge, ColorBadge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDashboard } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { LOCALE, formatDate, formatDateTime, formatMoney, formatNumber, label, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Табло" };

export default async function DashboardPage() {
  const ctx = await requireContext();
  const today = todayIso();
  const weekAhead = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const [data, settings] = await Promise.all([getDashboard(ctx.db, today, weekAhead), getSettings(ctx.db)]);
  const { totals, shipmentTotals, orderTotals, lowStockItems, recentMovements, upcoming, byCategory, byLocation, expiringSoon } = data;
  const maxCategoryValue = Math.max(1, ...byCategory.map((c) => c.value));
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const writable = can(ctx.role, "write");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Табло</h1>
          <p className="mt-1 text-sm text-muted first-letter:uppercase">{format(new Date(), "EEEE, d MMMM yyyy", { locale: LOCALE })}</p>
        </div>
        {writable && (
          <div className="flex gap-2">
            <ButtonLink href="/orders/new" variant="secondary">
              <ClipboardList className="h-4 w-4" />
              Нова поръчка
            </ButtonLink>
            <ButtonLink href="/items/new">
              <Package className="h-4 w-4" />
              Нов артикул
            </ButtonLink>
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Активни артикули" value={formatNumber(totals.itemCount)} hint={`${formatNumber(totals.totalUnits)} единици`} icon={Boxes} tone="accent" />
        <StatCard label="Стойност на склада" value={money(totals.stockValue)} hint={`Продажна ${money(totals.retailValue)}`} icon={Coins} tone="success" />
        <StatCard
          label="Ниска наличност"
          value={formatNumber(totals.lowStock)}
          hint={totals.lowStock > 0 ? "артикули под минимума" : "всичко над минимума"}
          icon={AlertTriangle}
          tone={totals.lowStock > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="Отворени пратки"
          value={formatNumber(shipmentTotals.open)}
          hint={shipmentTotals.overdue > 0 ? `${shipmentTotals.overdue} със закъснение` : "няма закъснели"}
          icon={Truck}
          tone={shipmentTotals.overdue > 0 ? "warning" : "neutral"}
        />
        <StatCard label="Отворени поръчки" value={formatNumber(orderTotals.open)} hint="потвърдени или частични" icon={ClipboardList} tone="neutral" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {settings.lowStockAlerts && (
            <Card>
              <CardHeader
                title="Изискват внимание"
                description="Артикули на или под минималното количество."
                actions={
                  <Link href="/items?low=1" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    Виж всички <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              />
              {lowStockItems.length === 0 ? (
                <CardBody className="text-sm text-muted">Всичко е над минималното ниво.</CardBody>
              ) : (
                <ul className="divide-y divide-line">
                  {lowStockItems.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link href={`/items/${i.id}`} className="font-medium hover:text-accent">
                          {i.name}
                          {i.variantLabel && <span className="text-muted"> · {i.variantLabel}</span>}
                        </Link>
                        <div className="text-xs text-muted">
                          {i.sku}
                          {i.category && <> · {i.category.name}</>}
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className={i.quantity === 0 ? "font-semibold text-danger" : "font-semibold"}>
                          {formatNumber(i.quantity)} {i.unit}
                        </div>
                        <div className="text-xs text-muted">мин. {i.minQuantity}</div>
                      </div>
                      {writable && (
                        <ButtonLink href={`/orders/new?type=purchase&item=${i.id}`} variant="secondary" size="sm">
                          Поръчай
                        </ButtonLink>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Последна активност" description="Най-новите складови движения." />
            {recentMovements.length === 0 ? (
              <CardBody className="text-sm text-muted">Все още няма складови движения.</CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {recentMovements.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <Badge tone={statusTone[m.type]}>{label(m.type)}</Badge>
                    <div className="min-w-0 flex-1 truncate">
                      <Link href={`/items/${m.itemId}`} className="font-medium hover:text-accent">
                        {m.item.name}
                      </Link>
                      <span className="text-muted">
                        {m.location && <> · {m.location.name}</>}
                        {m.reason && <> · {m.reason}</>}
                      </span>
                    </div>
                    <span className={`tabular-nums font-medium ${m.delta < 0 ? "text-danger" : "text-success"}`}>
                      {m.delta > 0 ? "+" : ""}
                      {formatNumber(m.delta)}
                    </span>
                    <span className="hidden w-36 text-right text-xs text-muted sm:block">{formatDateTime(m.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Следващите 7 дни"
              actions={
                <Link href="/calendar" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                  Календар <ArrowRight className="h-3 w-3" />
                </Link>
              }
            />
            {upcoming.length === 0 ? (
              <CardBody className="flex items-center gap-2 text-sm text-muted">
                <CalendarDays className="h-4 w-4" /> Няма планирани събития.
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.slice(0, 8).map((e) => (
                  <li key={e.key} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="w-14 shrink-0 text-xs tabular-nums text-muted">{formatDate(e.date, "d MMM")}</span>
                    <span className="min-w-0 flex-1 truncate">{e.href ? <Link href={e.href} className="hover:text-accent">{e.title}</Link> : e.title}</span>
                    <Badge tone={statusTone[e.kind] ?? "neutral"}>{label(e.kind)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="По локации" description="Единици и стойност по доставна цена." />
            <ul className="divide-y divide-line">
              {byLocation.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <MapPin className="h-4 w-4 text-muted" />
                  <Link href={`/items?location=${l.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent">
                    {l.name}
                  </Link>
                  <span className="text-xs text-muted tabular-nums">{formatNumber(l.units)} ед.</span>
                  <span className="tabular-nums">{money(l.value)}</span>
                </li>
              ))}
            </ul>
          </Card>

          {expiringSoon.length > 0 && (
            <Card>
              <CardHeader title="Изтичащи партиди" description="Срок на годност до 7 дни." />
              <ul className="divide-y divide-line">
                {expiringSoon.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <Timer className="h-4 w-4 text-danger" />
                    <Link href={`/items/${l.itemId}`} className="min-w-0 flex-1 truncate hover:text-accent">
                      {l.item.name} <span className="text-muted">· {l.lotNumber}</span>
                    </Link>
                    <span className="text-xs tabular-nums text-danger">{formatDate(l.expiryDate)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Стойност по категория" description="По доставна цена." />
            {byCategory.length === 0 ? (
              <CardBody className="text-sm text-muted">Все още няма категории.</CardBody>
            ) : (
              <CardBody className="space-y-3">
                {byCategory.map((c) => (
                  <Link key={c.id} href={`/items?category=${c.id}`} className="block">
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <ColorBadge color={c.color}>{c.name}</ColorBadge>
                      <span className="tabular-nums text-muted">{money(c.value)}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface-2">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (c.value / maxCategoryValue) * 100)}%`, backgroundColor: c.color }} />
                    </div>
                  </Link>
                ))}
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
