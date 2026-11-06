import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

const BADGE: Record<TileTone, string> = {
  accent: "border-line bg-surface-2 text-text",
  success: "border-green-200 bg-success-soft text-success",
  warning: "border-yellow-200 bg-warning-soft text-warning",
  danger: "border-red-200 bg-danger-soft text-danger",
  info: "border-blue-200 bg-info-soft text-info",
  neutral: "border-line bg-surface-2 text-muted",
};

export type TileProps = {
  href: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  tone?: TileTone;
  /** Брой за внимание; 0 или липса — без значка. */
  badge?: number;
  badgeTone?: TileTone;
  /** Пояснение към значката, напр. „3 неплатени“. */
  badgeLabel?: string;
};

/**
 * Плочка на началния екран: компактен бял ред с монохромна икона, заглавие, описание и брояч.
 * Цветът се използва само за брояча, когато нещо изисква внимание.
 */
export function Tile({ href, label, hint, icon: Icon, badge, badgeTone = "danger", badgeLabel }: TileProps) {
  return (
    <Link
      href={href}
      aria-label={badge ? `${label} — ${badgeLabel ?? badge}` : label}
      className="group flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 transition-colors hover:border-zinc-300 hover:bg-surface-2/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted group-hover:text-text" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-5">{label}</div>
        {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
      </div>
      {!!badge && (
        <span title={badgeLabel} className={cn("shrink-0 rounded-md border px-1.5 py-px text-xs font-medium tabular-nums", BADGE[badgeTone])}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
