import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-6 text-text" />
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6">{children}</div>
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
