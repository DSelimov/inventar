"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BarChart3, CalendarDays, CircleHelp, ClipboardCheck, ClipboardList, Factory, FileText, History, House, Layers, LayoutDashboard, Package, ScanLine, Settings, Tags, Trash, Truck, Users, Wallet } from "lucide-react";
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
  { href: "/transfers", label: "Трансфери", icon: ArrowLeftRight },
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

/** Лявото меню: светлосиво, активната точка с цветна лента вляво. Фирмата и потребителят са в горната лента. */
export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const linkClass = (href: string) =>
    cn(
      "flex shrink-0 items-center gap-2.5 border-l-4 px-4 py-2 text-sm transition-colors md:py-1.5",
      isActive(href) ? "border-accent bg-[#e7e7e7] text-text" : "border-transparent text-text hover:bg-[#ebebeb]",
    );

  return (
    <aside className="flex w-full min-w-0 shrink-0 flex-col overflow-hidden border-b border-line bg-surface-2 md:sticky md:top-12 md:h-[calc(100vh-3rem)] md:w-56 md:border-r md:border-b-0">
      <nav className="flex overflow-x-auto py-1 md:flex-1 md:flex-col md:overflow-y-auto md:py-3">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={linkClass(href)}>
            <Icon className="h-4 w-4 text-[#555555]" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="hidden border-t border-line py-2 md:block">
        <Link href="/settings" className={linkClass("/settings")}>
          <Settings className="h-4 w-4 text-[#555555]" />
          Настройки
        </Link>
        <Link href="/help" target="_blank" className={linkClass("/help")}>
          <CircleHelp className="h-4 w-4 text-[#555555]" />
          Помощ
        </Link>
      </div>
    </aside>
  );
}
