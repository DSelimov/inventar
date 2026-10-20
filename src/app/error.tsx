"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold">Възникна грешка</h1>
      <p className="mt-2 text-sm text-muted">{error.message || "Нещо се обърка. Опитайте отново."}</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="secondary" onClick={() => history.back()}>
          Назад
        </Button>
        <Button onClick={reset}>Опитай отново</Button>
      </div>
    </div>
  );
}
