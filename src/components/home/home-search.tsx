"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

const norm = (s: string) => s.toLocaleLowerCase("bg").replace(/\s+/g, " ").trim();

/**
 * Търсене на функция на началния екран: скрива плочките (data-home-tile, текстът в data-search), които не
 * съдържат всички въведени думи, и групите (data-home-group) без видими плочки. Enter отваря първата, Esc изчиства,
 * „/“ фокусира полето.
 */
export function HomeSearch({ containerId }: { containerId: string }) {
  const [query, setQuery] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  /** Прилага търсенето върху плочките в DOM (те са сървърни компоненти) и запомня броя на намерените. */
  function apply(value: string) {
    setQuery(value);
    const root = document.getElementById(containerId);
    if (!root) return;
    const words = norm(value).split(" ").filter(Boolean);
    let shown = 0;
    root.querySelectorAll<HTMLElement>("[data-home-tile]").forEach((el) => {
      const text = norm(el.dataset.search ?? "");
      const match = words.every((w) => text.includes(w));
      el.hidden = !match;
      if (match) shown++;
    });
    root.querySelectorAll<HTMLElement>("[data-home-group]").forEach((g) => {
      g.hidden = !g.querySelector("[data-home-tile]:not([hidden])");
    });
    const empty = root.querySelector<HTMLElement>("[data-home-empty]");
    if (empty) empty.hidden = !words.length || shown > 0;
    setCount(words.length ? shown : null);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full md:w-96">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(e) => apply(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") apply("");
          if (e.key === "Enter") {
            const first = document.getElementById(containerId)?.querySelector<HTMLAnchorElement>("[data-home-tile]:not([hidden])");
            if (first) first.click();
          }
        }}
        aria-label="Търсене на функция"
        placeholder="Търсене на функция… (напр. фактура, брак, баркод)"
        className="control pr-16 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          <span className="text-xs text-muted tabular-nums">{count}</span>
          <button type="button" onClick={() => apply("")} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Изчисти търсенето">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
