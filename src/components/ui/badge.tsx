import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Coloured dot + label, used for categories and collections. */
export function ColorBadge({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium", className)}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

export const statusTone: Record<string, Tone> = {
  pending: "warning",
  in_transit: "info",
  delivered: "success",
  cancelled: "neutral",
  active: "success",
  archived: "neutral",
  in: "success",
  out: "danger",
  adjust: "info",
  inbound: "info",
  outbound: "accent",
  event: "accent",
  reminder: "warning",
  deadline: "danger",
  expiry: "danger",
  draft: "neutral",
  confirmed: "info",
  partial: "warning",
  completed: "success",
  open: "info",
  applied: "success",
  transfer_in: "info",
  transfer_out: "info",
  purchase: "info",
  sales: "accent",
};
