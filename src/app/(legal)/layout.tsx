import Link from "next/link";
import { Boxes } from "lucide-react";
import { LEGAL_DRAFT, LEGAL_VERSION } from "@/lib/legal";
import { formatDate } from "@/lib/utils";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
          <Boxes className="h-5 w-5" />
        </span>
        <span className="text-lg font-semibold">Инвентар</span>
      </Link>
      {LEGAL_DRAFT && (
        <p className="mb-6 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          Чернова: данните на оператора още не са попълнени (полетата в квадратни скоби), а текстът трябва да бъде прегледан от юрист преди пускане.
        </p>
      )}
      <article className="legal space-y-4 rounded-2xl border border-line bg-surface p-6 text-sm leading-relaxed shadow-sm md:p-8">{children}</article>
      <nav className="mt-6 flex flex-wrap gap-4 text-sm text-muted">
        <Link href="/terms" className="hover:text-accent">
          Общи условия
        </Link>
        <Link href="/privacy" className="hover:text-accent">
          Поверителност
        </Link>
        <Link href="/dpa" className="hover:text-accent">
          Договор за обработване на данни
        </Link>
        <Link href="/cookies" className="hover:text-accent">
          Бисквитки
        </Link>
        <span className="ml-auto">Версия от {formatDate(LEGAL_VERSION, "dd.MM.yyyy")}</span>
      </nav>
    </div>
  );
}
