import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HELP, helpArticle } from "@/lib/help";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: helpArticle((await params).slug)?.title ?? "Помощ" };
}

export function generateStaticParams() {
  return HELP.map((a) => ({ slug: a.slug }));
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = helpArticle((await params).slug);
  if (!a) notFound();
  return (
    <article className="space-y-4 rounded-2xl border border-line bg-surface p-6 text-sm leading-relaxed shadow-sm md:p-8">
      <Link href="/help" className="text-xs text-muted hover:text-accent">
        ← Всички статии
      </Link>
      <h1 className="text-xl font-semibold">{a.title}</h1>
      <p className="text-muted">{a.summary}</p>
      <ol className="list-decimal space-y-2 pl-5">
        {a.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {a.tips && (
        <div className="rounded-xl bg-accent-soft p-4 text-accent">
          {a.tips.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      )}
    </article>
  );
}
