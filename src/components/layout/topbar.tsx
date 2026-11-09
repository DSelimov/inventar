"use client";

import Link from "next/link";
import { Bell, Boxes, ChevronDown, CircleUser, House, LogOut, ScanLine, Search, Settings, UserRound } from "lucide-react";
import type { Role } from "@/db/schema";
import { logout } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/permissions";

/** Синята горна лента: фирма, търсене, сканиране, известия и меню на потребителя. */
export function Topbar({
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
  alertCount?: number;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 bg-topbar px-3 text-white md:px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2 rounded px-1 py-1 hover:bg-topbar-hover" title="Начало">
        <span className="flex h-7 w-7 items-center justify-center rounded border border-white/40 bg-white/10">
          <Boxes className="h-4 w-4" />
        </span>
        <span className="hidden text-base sm:inline">Инвентар</span>
      </Link>

      <div className="min-w-0 max-w-56 truncate text-sm text-white/85">
        {organizations.length > 1 ? (
          <select
            aria-label="Организация"
            className="max-w-full truncate rounded bg-transparent py-1 text-sm text-white focus:outline-none [&>option]:text-text"
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
          <span className="hidden md:inline">{companyName}</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <form action="/items" role="search" className="relative hidden md:block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[#999999]" />
          <input
            type="search"
            name="q"
            aria-label="Търсене на артикул"
            placeholder="Търсене…"
            className="h-8 w-56 rounded border border-transparent bg-white pr-2 pl-8 text-sm text-text placeholder:text-[#999999] focus:outline-none focus:ring-3 focus:ring-white/40 lg:w-64"
          />
        </form>
        <Link href="/scan" className="flex h-8 items-center gap-1.5 rounded border border-[#cccccc] bg-white px-2.5 text-sm text-text hover:bg-[#e6e6e6]" title="Сканиране">
          <ScanLine className="h-4 w-4" />
          <span className="hidden sm:inline">Баркод</span>
        </Link>
        <Link href="/" className="hidden h-8 items-center gap-1.5 rounded px-2 text-sm hover:bg-topbar-hover lg:flex">
          <House className="h-4 w-4" />
          Начало
        </Link>
        <Link
          href="/notifications"
          aria-label={alertCount ? `Известия: ${alertCount}` : "Известия"}
          title="Известия"
          className="relative flex h-8 w-8 items-center justify-center rounded hover:bg-topbar-hover"
        >
          <Bell className="h-4 w-4" />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-bold leading-none tabular-nums">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>

        <details className="group relative">
          <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded px-2 text-sm hover:bg-topbar-hover [&::-webkit-details-marker]:hidden">
            <CircleUser className="h-4 w-4" />
            <span className="hidden max-w-40 truncate sm:inline">{userName}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </summary>
          <div className="absolute right-0 mt-1 w-56 rounded border border-line bg-surface py-1 text-sm text-text shadow-lg">
            <div className="border-b border-line px-3 py-2">
              <div className="truncate font-bold">{userName}</div>
              <div className="text-xs text-muted">{ROLE_LABELS[role]}</div>
            </div>
            <Link href="/profile" className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2">
              <UserRound className="h-4 w-4 text-muted" />
              Профил
            </Link>
            <Link href="/settings" className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2">
              <Settings className="h-4 w-4 text-muted" />
              Настройки
            </Link>
            <a href={portalUrl} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2">
              <Boxes className="h-4 w-4 text-muted" />
              Портал
            </a>
            <button type="button" onClick={() => void logout()} className="flex w-full items-center gap-2 border-t border-line px-3 py-1.5 text-left hover:bg-surface-2">
              <LogOut className="h-4 w-4 text-muted" />
              Изход
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
