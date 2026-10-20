"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Грешка при показване на страница. Сървърните грешки вече са в лога (onRequestError) и тук идват
 * само с digest — показваме го като код за поддръжката. Грешките в браузъра се изпращат към лога.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (error.digest) return;
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, stack: error.stack?.slice(0, 2000), path: location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold">Възникна грешка</h1>
      <p className="mt-2 text-sm text-muted">
        {error.digest ? "Нещо се обърка на сървъра. Грешката е записана; опитайте отново след малко." : error.message || "Нещо се обърка. Опитайте отново."}
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">Код: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="secondary" onClick={() => history.back()}>
          Назад
        </Button>
        <Button onClick={reset}>Опитай отново</Button>
      </div>
    </div>
  );
}
