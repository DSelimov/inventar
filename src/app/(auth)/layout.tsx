import Link from "next/link";
import { Boxes } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
          <Boxes className="h-5 w-5" />
        </div>
        <div className="text-lg font-semibold">Инвентар</div>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">{children}</div>
      <nav className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-muted">
        <Link href="/terms" className="hover:text-accent">
          Общи условия
        </Link>
        <Link href="/privacy" className="hover:text-accent">
          Поверителност
        </Link>
        <Link href="/cookies" className="hover:text-accent">
          Само необходими бисквитки
        </Link>
      </nav>
    </div>
  );
}
