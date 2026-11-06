import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

/** Тънка цветна линия отгоре — единственият цвят на плочката, освен иконата. */
const TOP: Record<TileTone, string> = {
  accent: "border-t-accent",
  success: "border-t-success",
  warning: "border-t-warning",
  danger: "border-t-danger",
  info: "border-t-info",
  neutral: "border-t-muted/50",
};

const ICON: Record<TileTone, string> = {
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-muted",
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

/**
 * Плочка на началния екран: бяла карта с цветна линия отгоре, заглавие и описание горе вляво,
 * голяма икона долу вдясно и мека сянка.
 */
export function Tile({ href, label, hint, icon: Icon, tone = "accent", badge, badgeTone = "danger", badgeLabel }: TileProps) {
  return (
    <Link
      href={href}
      aria-label={badge ? `${label} — ${badgeLabel ?? badge}` : label}
      className={cn(
        "group relative flex aspect-square flex-col rounded-xl border-t-[3px] bg-surface p-5 shadow-[0_12px_30px_-14px_rgba(17,24,39,0.22)] ring-1 ring-line/60 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_40px_-16px_rgba(17,24,39,0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:aspect-[5/4] sm:p-6",
        TOP[tone],
      )}
    >
      <div className="flex min-h-7 items-start justify-between gap-2">
        <div className="text-base font-semibold leading-tight tracking-tight sm:text-xl">{label}</div>
        {!!badge && (
          <span title={badgeLabel} className={cn("flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold tabular-nums", BADGE[badgeTone])}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      {hint && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted sm:mt-3 sm:text-sm">{hint}</p>}
      <Icon aria-hidden className={cn("mt-auto h-10 w-10 self-end transition-transform duration-200 group-hover:scale-110 sm:h-14 sm:w-14", ICON[tone])} strokeWidth={1.5} />
    </Link>
  );
}
