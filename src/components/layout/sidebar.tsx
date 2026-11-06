"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, House, Boxes, CircleHelp, Building2, CalendarDays, Factory, ClipboardCheck, ClipboardList, FileText, History, Layers, LayoutDashboard, LogOut, Package, ScanLine, Settings, Tags, Trash, Truck, Users, Wallet } from "lucide-react";
import type { Role } from "@/db/schema";
import { logout } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Начало", icon: House },
  { href: "/dashboard", label: "Табло", icon: LayoutDashboard },
  { href: "/items", label: "Артикули", icon: Package },
  { href: "/categories", label: "Категории", icon: Tags },
  { href: "/orders", label: "Поръчки", icon: ClipboardList },
  { href: "/shipments", label: "Пратки", icon: Truck },
  { href: "/invoices", label: "Фактури", icon: FileText },
  { href: "/cash", label: "Каса и банка", icon: Wallet },
  { href: "/movements", label: "Движения", icon: History },
  { href: "/counts", label: "Инвентаризация", icon: ClipboardCheck },
  { href: "/write-offs", label: "Брак", icon: Trash },
  { href: "/production", label: "Производство", icon: Factory },
  { href: "/partners", label: "Партньори", icon: Users },
  { href: "/collections", label: "Колекции", icon: Layers },
  { href: "/calendar", label: "Календар", icon: CalendarDays },
  { href: "/reports", label: "Отчети", icon: BarChart3 },
  { href: "/scan", label: "Сканиране", icon: ScanLine },
];

export function Sidebar({
  companyName,
  userName,
  role,
  currentOrgId,
  organizations,
  portalUrl,
  alertCount = 0,
}: {
  companyName: string;
  userName: string;
  role: Role;
  currentOrgId: number;
  organizations: Array<{ id: number; name: string; url: string }>;
  portalUrl: string;
  /** Брой известия (ниска наличност, закъснели пратки, изтичащи партиди). */
  alertCount?: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const linkClass = (href: string) =>
    cn(
      "flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
      isActive(href) ? "bg-surface-2 font-medium text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
    );

  return (
    <aside className="flex w-full min-w-0 shrink-0 flex-col overflow-hidden border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
          <Boxes className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          {organizations.length > 1 ? (
            <select
              aria-label="Организация"
              className="w-full truncate bg-transparent text-sm font-semibold leading-tight focus:outline-none"
              value={currentOrgId}
              onChange={(e) => {
                const target = organizations.find((o) => String(o.id) === e.target.value);
                if (target && target.id !== currentOrgId) window.location.href = target.url;
              }}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="truncate text-sm font-semibold leading-tight">{companyName}</div>
          )}
          <a href={portalUrl} className="block truncate whitespace-nowrap text-xs text-muted hover:text-text">
            Инвентар · портал
          </a>
        </div>
        <Link
          href="/notifications"
          aria-label={alertCount ? `Известия: ${alertCount}` : "Известия"}
          title="Известия"
          className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors", isActive("/notifications") ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text")}
        >
          <Bell className="h-4 w-4" />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium leading-none text-white tabular-nums">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>
      </div>

      <nav className="flex gap-0.5 overflow-x-auto px-2 pb-3 md:flex-1 md:flex-col md:overflow-y-auto md:pb-0">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={linkClass(href)}>
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </Link>
        ))}
        <Link href="/settings" className={cn(linkClass("/settings"), "md:hidden")}>
          <Settings className="h-4 w-4" />
          Настройки
        </Link>
        <button type="button" onClick={() => void logout()} className={cn(linkClass("/__logout"), "md:hidden")}>
          <LogOut className="h-4 w-4" />
          Изход
        </button>
      </nav>

      <div className="hidden border-t border-line p-2 md:block">
        <Link href="/settings" className={linkClass("/settings")}>
          <Settings className="h-4 w-4" />
          Настройки
        </Link>
        <Link href="/help" target="_blank" className={linkClass("/help")}>
          <CircleHelp className="h-4 w-4" />
          Помощ
        </Link>
        <div className="mt-1 flex items-center gap-2.5 px-2.5 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-medium text-muted">
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <Link href="/profile" className="min-w-0 flex-1 rounded-md hover:text-text" title="Профил">
            <div className="truncate text-sm font-medium">{userName}</div>
            <div className="flex items-center gap-1 text-xs text-muted">
              <Building2 className="h-3 w-3" />
              {ROLE_LABELS[role]}
            </div>
          </Link>
          <button type="button" onClick={() => void logout()} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Изход" title="Изход">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
