"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "Организация" },
  { href: "/settings/users", label: "Потребители" },
  { href: "/settings/locations", label: "Локации" },
  { href: "/settings/vat", label: "ДДС" },
  { href: "/settings/import", label: "Импорт / Експорт" },
  { href: "/settings/api", label: "API" },
  { href: "/settings/webhooks", label: "Webhooks" },
  { href: "/settings/audit", label: "Одит" },
  { href: "/settings/plan", label: "Абонамент" },
];

export function SettingsTabs({ manage }: { manage: boolean }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
      {TABS.filter((t) => manage || t.href === "/settings" || t.href === "/settings/plan").map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            (t.href === "/settings" ? pathname === "/settings" : pathname.startsWith(t.href)) ? "bg-accent-soft text-accent" : "text-muted hover:text-text",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
