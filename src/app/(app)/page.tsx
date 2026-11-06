import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  BarChart3,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FileUp,
  History,
  LayoutDashboard,
  Lightbulb,
  MapPin,
  Package,
  PackagePlus,
  ScanLine,
  Search,
  Settings,
  ShoppingCart,
  Smartphone,
  Tags,
  Trash,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Tile, type TileTone } from "@/components/home/tile";
import { alertCounts } from "@/lib/alerts";
import { requireContext } from "@/lib/auth";
import { can, type Level } from "@/lib/permissions";
import { getHomeCounts } from "@/lib/queries";
import { formatMoney, formatNumber, LOCALE, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Начало" };

type TileDef = {
  href: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  tone: TileTone;
  level?: Level;
  badge?: number;
  badgeTone?: TileTone;
  badgeLabel?: string;
};

function greeting(hour: number) {
  if (hour < 11) return "Добро утро";
  if (hour < 18) return "Добър ден";
  return "Добър вечер";
}

export default async function HomePage() {
  const ctx = await requireContext();
  const [alerts, c] = await Promise.all([alertCounts(ctx.db, todayIso()), getHomeCounts(ctx.db)]);
  const openShipments = c.inboundShipments + c.outboundShipments;
  const now = new Date();

  // По 4 плочки в група — на компютър един ред, на телефон два реда по две.
  const groups: Array<{ title: string; tiles: TileDef[] }> = [
    {
      title: "Бързи операции",
      tiles: [
        { href: "/orders/new?type=sales", label: "Продажба", hint: "Нова клиентска поръчка", icon: ShoppingCart, tone: "accent", level: "write" },
        { href: "/shipments/new?direction=inbound", label: "Приход", hint: "Приемане на стока", icon: ArrowDownToLine, tone: "success", level: "write" },
        { href: "/shipments/new?direction=outbound", label: "Експедиция", hint: "Изписване и изпращане", icon: ArrowUpFromLine, tone: "info", level: "write" },
        { href: "/orders/new?type=purchase", label: "Доставка", hint: "Поръчка към доставчик", icon: ClipboardList, tone: "warning", level: "write" },
        { href: "/scan", label: "Сканиране", hint: "Приход и разход с баркод", icon: ScanLine, tone: "neutral" },
        { href: "/counts", label: "Инвентаризация", hint: "Броене и изравняване", icon: ClipboardCheck, tone: "success", badge: c.openCounts, badgeLabel: `${c.openCounts} отворени` },
        { href: "/write-offs/new", label: "Брак", hint: "Протокол за бракуване", icon: Trash, tone: "danger", level: "write" },
        { href: "/items/new", label: "Нов артикул", hint: "Добавяне в номенклатурата", icon: PackagePlus, tone: "accent", level: "write" },
      ],
    },
    {
      title: "Документи",
      tiles: [
        {
          href: "/orders",
          label: "Поръчки",
          hint: c.draftOrders ? `${c.openOrders} отворени · ${c.draftOrders} чернови` : `${c.openOrders} отворени`,
          icon: ClipboardList,
          tone: "accent",
          badge: c.openOrders,
          badgeTone: "accent",
          badgeLabel: `${c.openOrders} отворени`,
        },
        {
          href: "/shipments",
          label: "Пратки",
          hint: `${c.inboundShipments} входящи · ${c.outboundShipments} изходящи`,
          icon: Truck,
          tone: "info",
          badge: alerts.overdue || openShipments,
          badgeTone: alerts.overdue ? "danger" : "info",
          badgeLabel: alerts.overdue ? `${alerts.overdue} закъснели` : `${openShipments} очаквани`,
        },
        {
          href: "/invoices",
          label: "Фактури",
          hint: alerts.overdueInvoices ? `${c.unpaidInvoices} неплатени · ${alerts.overdueInvoices} просрочени` : `${c.unpaidInvoices} неплатени`,
          icon: FileText,
          tone: "success",
          badge: alerts.overdueInvoices || c.unpaidInvoices,
          badgeTone: alerts.overdueInvoices ? "danger" : "warning",
          badgeLabel: alerts.overdueInvoices ? `${alerts.overdueInvoices} просрочени` : `${c.unpaidInvoices} неплатени`,
        },
        { href: "/movements", label: "Движения", hint: "История на наличностите", icon: History, tone: "neutral" },
      ],
    },
    {
      title: "Номенклатури",
      tiles: [
        {
          href: alerts.lowStock ? "/items?low=1" : "/items",
          label: "Артикули",
          hint: alerts.lowStock ? `${alerts.lowStock} под минимума` : "Стоки, цени, наличности",
          icon: Package,
          tone: "accent",
          badge: alerts.lowStock,
          badgeLabel: `${alerts.lowStock} с ниска наличност`,
        },
        { href: "/partners", label: "Партньори", hint: "Клиенти и доставчици", icon: Users, tone: "info" },
        { href: "/categories", label: "Категории", hint: "Групи и полета", icon: Tags, tone: "warning" },
        { href: "/settings/locations", label: "Складове", hint: "Локации и обекти", icon: MapPin, tone: "success", level: "manage" },
      ],
    },
    {
      title: "Справки",
      tiles: [
        { href: "/dashboard", label: "Табло", hint: "Показатели и активност", icon: LayoutDashboard, tone: "accent" },
        { href: "/reports", label: "Отчети", hint: "Стойност, оборот, марж", icon: BarChart3, tone: "info" },
        { href: "/orders/suggestions", label: "Предложения", hint: "Какво да се поръча", icon: Lightbulb, tone: "warning" },
        { href: "/reports/accounting", label: "За счетоводителя", hint: "Експорт на документи", icon: FileSpreadsheet, tone: "success", level: "write" },
      ],
    },
    {
      title: "Система",
      tiles: [
        { href: "/m", label: "Мобилен режим", hint: "Склад от телефона", icon: Smartphone, tone: "accent" },
        { href: "/settings/import", label: "Импорт", hint: "CSV и Microinvest", icon: FileUp, tone: "success", level: "manage" },
        { href: "/settings", label: "Настройки", hint: "Фирма, потребители", icon: Settings, tone: "neutral" },
        { href: "/help", label: "Помощ", hint: "Ръководства", icon: CircleHelp, tone: "info" },
      ],
    },
  ];

  const visible = groups
    .map((g) => ({ ...g, tiles: g.tiles.filter((t) => !t.level || can(ctx.role, t.level)) }))
    .filter((g) => g.tiles.length > 0);

  const kpis = [
    { label: "Стойност на склада", value: formatMoney(c.stockValue, ctx.org.currency), href: "/reports/valuation" },
    { label: "Отворени поръчки", value: formatNumber(c.openOrders), href: "/orders" },
    { label: "Очаквани пратки", value: formatNumber(openShipments), href: "/shipments" },
    { label: "Известия", value: formatNumber(alerts.total), href: "/notifications" },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-7">
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-accent first-letter:uppercase">{format(now, "EEEE, d MMMM yyyy", { locale: LOCALE })}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting(now.getHours())}, {ctx.user.name.split(" ")[0]}
            </h1>
            <p className="mt-1 truncate text-sm text-muted">{ctx.org.name}</p>
          </div>
          <form action="/items" role="search" className="relative w-full md:w-96">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              aria-label="Търсене на артикул"
              placeholder="Търсене на артикул по име, код или баркод…"
              className="h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-sm shadow-sm placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
            />
          </form>
        </div>
        <dl className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <Link key={k.label} href={k.href} className="group rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-line transition hover:ring-accent/30">
              <dt className="text-xs font-medium text-muted">{k.label}</dt>
              <dd className="mt-0.5 flex items-center justify-between gap-2 text-lg font-semibold tabular-nums tracking-tight">
                <span className="truncate">{k.value}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </dd>
            </Link>
          ))}
        </dl>
      </section>

      {visible.map((g) => (
        <section key={g.title} aria-labelledby={`home-${g.title}`}>
          <h2 id={`home-${g.title}`} className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {g.title}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
            {g.tiles.map((t) => (
              <Tile
                key={t.href}
                href={t.href}
                label={t.label}
                hint={t.hint}
                icon={t.icon}
                tone={t.tone}
                badge={t.badge}
                badgeTone={t.badgeTone}
                badgeLabel={t.badgeLabel}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
