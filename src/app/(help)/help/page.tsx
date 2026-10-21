import type { Metadata } from "next";
import Link from "next/link";
import { HELP } from "@/lib/help";

export const metadata: Metadata = { title: "Помощ" };

export default function HelpIndex() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Помощ</h1>
      <p className="text-sm text-muted">Кратки ръководства за основните задачи. От всяка страница „?“ до заглавието води към съответната статия.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {HELP.map((a) => (
          <Link key={a.slug} href={`/help/${a.slug}`} className="rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-accent">
            <div className="font-medium">{a.title}</div>
            <p className="mt-1 text-sm text-muted">{a.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
