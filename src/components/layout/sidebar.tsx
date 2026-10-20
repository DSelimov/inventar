"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CalendarDays, LayoutDashboard, Layers, Package, Settings, Tags, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Табло", icon: LayoutDashboard },
  { href: "/items", label: "Артикули", icon: Package },
  { href: "/categories", label: "Категории", icon: Tags },
  { href: "/shipments", label: "Пратки", icon: Truck },
  { href: "/collections", label: "Колекции", icon: Layers },
  { href: "/calendar", label: "Календар", icon: CalendarDays },
];

export function Sidebar({ companyName }: { companyName: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const linkClass = (href: string) =>
    cn(
      "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      isActive(href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
    );

  return (
    <aside className="flex w-full min-w-0 shrink-0 flex-col overflow-hidden border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
          <Boxes className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">{companyName}</div>
          <div className="text-xs text-muted">Инвентар</div>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={linkClass(href)}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
        <Link href="/settings" className={cn(linkClass("/settings"), "md:hidden")}>
          <Settings className="h-4 w-4" />
          Настройки
        </Link>
      </nav>

      <div className="hidden border-t border-line p-3 md:block">
        <Link href="/settings" className={linkClass("/settings")}>
          <Settings className="h-4 w-4" />
          Настройки
        </Link>
      </div>
    </aside>
  );
}
