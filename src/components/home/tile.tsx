import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

/** Мек цвят само за иконата — плочката е бяла. */
const ICON: Record<TileTone, string> = {
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-2 text-muted ring-1 ring-inset ring-line",
};

const BADGE: Record<TileTone, string> = {
  accent: "bg-accent text-white",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  danger: "bg-danger text-white",
  info: "bg-info text-white",
  neutral: "bg-surface-2 text-muted",
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

/** Бяла квадратна плочка на началния екран: голяма зона за натискане, удобна и на таблет/телефон. */
export function Tile({ href, label, hint, icon: Icon, tone = "accent", badge, badgeTone = "danger", badgeLabel }: TileProps) {
  return (
    <Link
      href={href}
      aria-label={badge ? `${label} — ${badgeLabel ?? badge}` : label}
      className="group relative flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl border border-line bg-surface p-4 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-4"
    >
      {!!badge && (
        <span
          title={badgeLabel}
          className={cn("absolute top-3 right-3 flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold tabular-nums sm:top-4 sm:right-4", BADGE[badgeTone])}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      <div className={cn("flex h-16 w-16 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-110 sm:h-20 sm:w-20", ICON[tone])}>
        <Icon className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <div className="text-base font-semibold leading-tight sm:text-lg">{label}</div>
        {hint && <div className="mt-1 line-clamp-2 text-xs text-muted sm:text-sm">{hint}</div>}
      </div>
    </Link>
  );
}
