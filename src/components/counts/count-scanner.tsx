"use client";

import { ScanLine } from "lucide-react";
import { useEffect, useRef } from "react";
import { Scanner } from "@/components/scan/scanner";
import { Input, Select } from "@/components/ui/fields";
import { Form, useFormPending } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "@/components/ui/toaster";
import type { ActionResult } from "@/lib/action";

/** Полето за код остава на фокус след всяко сканиране — USB скенерът може да сканира подред. */
function Refocus({ target }: { target: React.RefObject<HTMLInputElement | null> }) {
  const pending = useFormPending();
  useEffect(() => {
    if (!pending) target.current?.focus();
  }, [pending, target]);
  return null;
}

export function CountScanner({ action }: { action: (fd: FormData) => Promise<ActionResult> }) {
  const codeRef = useRef<HTMLInputElement>(null);
  const onCamera = async (code: string) => {
    const fd = new FormData();
    fd.set("code", code);
    fd.set("quantity", "1");
    fd.set("mode", "add");
    const r = await action(fd);
    if (r?.error) toast(r.error, "error");
    else if (r?.ok) toast(r.ok);
  };

  return (
    <div className="space-y-3">
      <Form action={action} className="flex flex-wrap items-end gap-2">
        <Refocus target={codeRef} />
        <div className="min-w-52 flex-1">
          <Input ref={codeRef} name="code" placeholder="Сканирайте баркод, код или партида…" className="font-mono" autoFocus autoComplete="off" required />
        </div>
        <Input name="quantity" type="number" min={0} defaultValue={1} className="w-20" aria-label="Количество" />
        <Select name="mode" defaultValue="add" className="w-auto" aria-label="Режим">
          <option value="add">+ прибави</option>
          <option value="set">= задай</option>
        </Select>
        <SubmitButton>
          <ScanLine className="h-4 w-4" />
          Отчети
        </SubmitButton>
      </Form>
      <p className="text-xs text-muted">Всяко сканиране прибавя количеството (по подразбиране 1). „= задай“ записва точното преброено количество.</p>
      <Scanner hideInput continuous onCode={(code) => void onCamera(code)} />
    </div>
  );
}
