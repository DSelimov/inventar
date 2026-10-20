import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

/** GET form that writes its fields into the query string. */
export function FilterBar({ children, action, resetHref }: { children: ReactNode; action: string; resetHref?: string }) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface p-3 shadow-sm">
      {children}
      <Button type="submit" variant="secondary" size="md">
        <Search className="h-4 w-4" />
        Филтрирай
      </Button>
      {resetHref && (
        <a href={resetHref} className="text-sm text-muted hover:text-text">
          Изчисти
        </a>
      )}
    </form>
  );
}
