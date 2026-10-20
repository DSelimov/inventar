import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SearchParams } from "@/lib/paging";
import { cn, formatNumber } from "@/lib/utils";

/** Номера на страници около текущата: 1 … 4 5 [6] 7 8 … 20 */
function pageList(page: number, pages: number): Array<number | "…"> {
  const set = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

/** „1–50 от 1 234“ + страници. Запазва всички филтри от адреса. */
export function Pagination({ basePath, searchParams, page, pageSize, total, noun = "реда" }: { basePath: string; searchParams: SearchParams; page: number; pageSize: number; total: number; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === "page" || v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [v]) if (one !== "") qs.append(k, one);
    }
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm tabular-nums";

  return (
    <nav aria-label="Страници" className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">
        {total === 0 ? `Няма ${noun}` : `${formatNumber(from)}–${formatNumber(to)} от ${formatNumber(total)} ${noun}`}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          {page > 1 ? (
            <Link href={href(page - 1)} className={cn(link, "text-muted hover:bg-surface-2 hover:text-text")} aria-label="Предишна страница" rel="prev">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className={cn(link, "text-line")}>
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          {pageList(page, pages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className={cn(link, "text-muted")}>
                …
              </span>
            ) : (
              <Link key={p} href={href(p)} aria-current={p === page ? "page" : undefined} className={cn(link, p === page ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-surface-2 hover:text-text")}>
                {p}
              </Link>
            ),
          )}
          {page < pages ? (
            <Link href={href(page + 1)} className={cn(link, "text-muted hover:bg-surface-2 hover:text-text")} aria-label="Следваща страница" rel="next">
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className={cn(link, "text-line")}>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
