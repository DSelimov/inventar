import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

const BADGE: Record<TileTone, string> = {
  accent: "border-transparent bg-accent text-white",
  success: "border-transparent bg-success-solid text-white",
  warning: "border-transparent bg-warning-solid text-white",
  danger: "border-transparent bg-danger-solid text-white",
  info: "border-transparent bg-info-solid text-white",
  neutral: "border-transparent bg-[#777777] text-white",
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
  /** Текст за търсенето на началния екран (заглавие, описание, група, синоними). */
  search?: string;
};

/**
 * Плочка на началния екран: компактен бял ред с монохромна икона, заглавие, описание и брояч.
 * Цветът се използва само за брояча, когато нещо изисква внимание.
 */
export function Tile({ href, label, hint, icon: Icon, badge, badgeTone = "danger", badgeLabel, search }: TileProps) {
  return (
    <Link
      href={href}
      aria-label={badge ? `${label} — ${badgeLabel ?? badge}` : label}
      data-home-tile
      data-search={search ?? [label, hint].filter(Boolean).join(" ")}
      className="group flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 transition-colors hover:border-accent/50 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold leading-6">{label}</div>
        {hint && <p className="mt-0.5 line-clamp-2 text-sm text-text/70">{hint}</p>}
      </div>
      {!!badge && (
        <span title={badgeLabel} className={cn("shrink-0 rounded-md border px-2 py-0.5 text-sm font-semibold tabular-nums", BADGE[badgeTone])}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
