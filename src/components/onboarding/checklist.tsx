import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export function OnboardingChecklist({ steps }: { steps: Array<{ key: string; label: string; href: string; done: boolean }> }) {
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.key}>
          <Link href={s.href} className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2", s.done && "text-muted line-through")}>
            {s.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-line" />}
            {s.label}
          </Link>
        </li>
      ))}
    </ol>
  );
}
