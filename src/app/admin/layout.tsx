import Link from "next/link";
import { Boxes } from "lucide-react";
import { rootUrl } from "@/lib/tenant";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <Boxes className="h-4 w-4" />
            </span>
            Инвентар · Платформа
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin" className="text-muted hover:text-text">
              Организации
            </Link>
            <Link href="/admin/pool" className="text-muted hover:text-text">
              Пул от бази
            </Link>
          </nav>
          <a href={rootUrl("/portal")} className="ml-auto text-sm text-muted hover:text-accent">
            Към портала
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
