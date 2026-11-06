import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-surface text-muted border-line",
  success: "bg-success-soft text-success border-green-200",
  warning: "bg-warning-soft text-warning border-yellow-200",
  danger: "bg-danger-soft text-danger border-red-200",
  info: "bg-info-soft text-info border-blue-200",
  accent: "bg-surface-2 text-text border-line",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Coloured dot + label, used for categories and collections. */
export function ColorBadge({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-text", className)}>
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
  write_off: "danger",
  produce_in: "success",
  produce_out: "warning",
  assembly: "success",
  disassembly: "warning",
  purchase: "info",
  sales: "accent",
};
