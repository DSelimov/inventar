import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lightbulb } from "lucide-react";
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
    <article className="space-y-6 rounded-lg border border-line bg-surface p-6 text-sm leading-relaxed md:p-8">
      <div>
        <Link href="/help" className="text-xs text-muted hover:text-accent">
          ← Всички статии
        </Link>
        <h1 className="mt-2 text-2xl font-normal">{a.title}</h1>
        <p className="mt-1 text-base text-muted">{a.summary}</p>
        {a.links && a.links.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {a.links.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                className={i === 0 ? "inline-flex items-center gap-1.5 rounded border border-[#2e6da4] bg-accent px-3 py-1.5 text-white hover:bg-accent-hover" : "inline-flex items-center gap-1.5 rounded border border-[#cccccc] px-3 py-1.5 hover:bg-[#e6e6e6]"}
              >
                {l.label}
                {i === 0 && <ArrowRight className="h-3.5 w-3.5" />}
              </Link>
            ))}
          </div>
        )}
      </div>

      {a.overview && (
        <section>
          <h2 className="mb-2 text-base font-bold">Какво има на страницата</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            {a.overview.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {a.steps && (
        <section>
          {(a.overview || a.tasks) && <h2 className="mb-2 text-base font-bold">Как се работи</h2>}
          <ol className="list-decimal space-y-2 pl-5">
            {a.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      {a.tasks?.map((t) => (
        <section key={t.title}>
          <h2 className="mb-2 text-base font-bold">{t.title}</h2>
          <ol className="list-decimal space-y-1.5 pl-5">
            {t.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      ))}

      {a.tips && (
        <section className="rounded border border-[#bce8f1] bg-info-soft p-4 text-info">
          <h2 className="mb-1.5 flex items-center gap-1.5 font-bold">
            <Lightbulb className="h-4 w-4" /> Полезно
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {a.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
