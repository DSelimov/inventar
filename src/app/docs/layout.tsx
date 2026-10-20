import Link from "next/link";
import { Boxes, Braces, TerminalSquare } from "lucide-react";
import { API_VERSION } from "@/lib/openapi";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 md:px-8">
          <Link href="/docs/api" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <Boxes className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold">Инвентар API</span>
            <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">v{API_VERSION}</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/docs/api" className="rounded-lg px-3 py-1.5 font-medium text-muted hover:bg-surface-2 hover:text-text">
              Документация
            </Link>
            <Link href="/docs/api/swagger" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-muted hover:bg-surface-2 hover:text-text">
              <TerminalSquare className="h-4 w-4" /> Swagger UI
            </Link>
            <a href="/api/v1/openapi.json" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-muted hover:bg-surface-2 hover:text-text" target="_blank" rel="noreferrer">
              <Braces className="h-4 w-4" /> openapi.json
            </a>
            <Link href="/" className="ml-2 rounded-lg bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-hover">
              Към приложението
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
