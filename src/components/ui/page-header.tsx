import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, CircleHelp } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
  help,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
  /** Статия от помощния център (src/lib/help.ts) — „?“ до заглавието. */
  help?: string;
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-text">
          <ChevronLeft className="h-3.5 w-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{eyebrow}</div>}
          <h1 className="flex items-center gap-2 truncate text-2xl font-semibold tracking-tight">
            {title}
            {help && (
              <Link href={`/help/${help}`} target="_blank" className="text-muted hover:text-accent" aria-label="Помощ за тази страница" title="Помощ">
                <CircleHelp className="h-5 w-5" />
              </Link>
            )}
          </h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
