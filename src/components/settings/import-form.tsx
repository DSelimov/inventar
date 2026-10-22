"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ImportRow } from "@/lib/actions/import";
import { mapHeader, parseCsv } from "@/lib/csv";
import { decodeText } from "@/lib/encoding";
import { Form } from "@/components/ui/form";
import type { ActionResult } from "@/lib/action";

const num = (v: string | undefined) => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

export function ImportForm({ action }: { action: (fd: FormData) => Promise<ActionResult> }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const onFile = async (file: File | undefined) => {
    setError(null);
    setRows([]);
    if (!file) return;
    setFileName(file.name);
    const text = decodeText(await file.arrayBuffer()); // UTF-8 или Windows-1251 (експорт от Microinvest)
    const table = parseCsv(text);
    if (table.length < 2) return setError("Файлът няма редове с данни.");
    const map = mapHeader(table[0]);
    if (map.sku === undefined || map.name === undefined) return setError("Нужни са поне колони „sku“ (код) и „name“ (име). Разпознати: " + Object.keys(map).join(", "));
    const get = (r: string[], k: string) => (map[k] === undefined ? undefined : r[map[k]]);
    const parsed: ImportRow[] = table.slice(1).map((r) => ({
      sku: get(r, "sku") ?? "",
      name: get(r, "name") ?? "",
      barcode: get(r, "barcode") || undefined,
      category: get(r, "category") || undefined,
      quantity: num(get(r, "quantity")),
      minQuantity: num(get(r, "minQuantity")),
      unit: get(r, "unit") || undefined,
      unitCost: num(get(r, "unitCost")),
      unitPrice: num(get(r, "unitPrice")),
      location: get(r, "location") || undefined,
      description: get(r, "description") || undefined,
    }));
    const valid = parsed.filter((r) => r.sku && r.name);
    if (!valid.length) return setError("Нито един ред няма и код, и име.");
    setRows(valid);
  };

  return (
    <Form action={action} className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface-2/50 p-8 text-center text-sm hover:border-accent/50">
        <Upload className="h-6 w-6 text-muted" />
        <span className="font-medium">{fileName || "Изберете CSV файл"}</span>
        <span className="text-xs text-muted">Разделител „;“, „,“ или табулация; UTF-8 или Windows-1251. Първият ред са заглавията.</span>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Име</th>
                  <th>Категория</th>
                  <th className="text-right">Кол.</th>
                  <th className="text-right">Мин.</th>
                  <th className="text-right">Доставна</th>
                  <th className="text-right">Продажна</th>
                  <th>Локация</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 15).map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs">{r.sku}</td>
                    <td>{r.name}</td>
                    <td className="text-muted">{r.category ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.quantity ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.minQuantity ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.unitCost ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.unitPrice ?? "—"}</td>
                    <td className="text-muted">{r.location ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            {rows.length} реда за импорт{rows.length > 15 ? ` (показани първите 15)` : ""}. Съществуващите кодове се обновяват, новите се създават. Нови категории се създават автоматично.
          </p>
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <Checkbox name="setQuantities" value="1" defaultChecked label="Задай наличностите от колоната „количество“ (записва се като корекция в локацията)" />
          <SubmitButton>Импортирай {rows.length} реда</SubmitButton>
        </>
      )}
    </Form>
  );
}
