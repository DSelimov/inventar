"use client";

import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error";
type Toast = { id: number; message: string; tone: Tone };

const listeners = new Set<(t: Toast) => void>();
let seq = 0;

/** Показва кратко съобщение долу вдясно. */
export function toast(message: string, tone: Tone = "success") {
  const t = { id: ++seq, message, tone };
  listeners.forEach((l) => l(t));
}

const FLASH = "inv_flash";

/** Съобщение, оставено от сървъра преди redirect (redirectWith в src/lib/action.ts). */
export function consumeFlash() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${FLASH}=([^;]*)`));
  if (!match) return;
  document.cookie = `${FLASH}=; path=/; max-age=0`;
  try {
    toast(decodeURIComponent(decodeURIComponent(match[1])));
  } catch {
    // повреден cookie — пропускаме
  }
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const add = (t: Toast) => {
      setToasts((list) => [...list.slice(-3), t]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.tone === "error" ? 7000 : 4000);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  useEffect(consumeFlash, [pathname, search]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          data-toast={t.tone}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm shadow-lg",
            t.tone === "error" ? "border-danger/30" : "border-line",
          )}
        >
          {t.tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
          <p className="flex-1">{t.message}</p>
          <button type="button" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} className="text-muted hover:text-text" aria-label="Затвори">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
