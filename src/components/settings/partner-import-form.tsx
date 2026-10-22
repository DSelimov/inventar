"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PartnerImportRow } from "@/lib/actions/import";
import { mapHeader, parseCsv, PARTNER_IMPORT_COLUMNS } from "@/lib/csv";
import { decodeText } from "@/lib/encoding";
import { Form } from "@/components/ui/form";
import type { ActionResult } from "@/lib/action";

export function PartnerImportForm({ action }: { action: (fd: FormData) => Promise<ActionResult> }) {
  const [rows, setRows] = useState<PartnerImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const onFile = async (file: File | undefined) => {
    setError(null);
    setRows([]);
    if (!file) return;
    setFileName(file.name);
    const table = parseCsv(decodeText(await file.arrayBuffer()));
    if (table.length < 2) return setError("Файлът няма редове с данни.");
    const map = mapHeader(table[0], PARTNER_IMPORT_COLUMNS);
    if (map.name === undefined) return setError("Нужна е колона с името („име“, „фирма“ или „name“). Разпознати: " + (Object.keys(map).join(", ") || "няма"));
    const get = (r: string[], k: string) => (map[k] === undefined ? undefined : r[map[k]]?.trim() || undefined);
    const parsed = table.slice(1).map((r): PartnerImportRow => ({
      name: get(r, "name") ?? "",
      eik: get(r, "eik"),
      vatNumber: get(r, "vatNumber"),
      contactName: get(r, "contactName"),
      email: get(r, "email"),
      phone: get(r, "phone"),
      city: get(r, "city"),
      address: get(r, "address"),
      type: get(r, "type"),
      notes: get(r, "notes"),
    }));
    const valid = parsed.filter((r) => r.name);
    if (!valid.length) return setError("Нито един ред няма име.");
    setRows(valid);
  };

  return (
    <Form action={action} className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface-2/50 p-6 text-center text-sm hover:border-accent/50">
        <Upload className="h-6 w-6 text-muted" />
        <span className="font-medium">{fileName || "Изберете CSV файл с партньори"}</span>
        <span className="text-xs text-muted">Колони: име/фирма, ЕИК/булстат, ДДС №, МОЛ, град, адрес, телефон, имейл, тип (клиент/доставчик).</span>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Име</th>
                  <th>ЕИК</th>
                  <th>ДДС №</th>
                  <th>МОЛ</th>
                  <th>Адрес</th>
                  <th>Телефон</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td className="font-mono text-xs">{r.eik ?? "—"}</td>
                    <td className="font-mono text-xs">{r.vatNumber ?? "—"}</td>
                    <td className="text-muted">{r.contactName ?? "—"}</td>
                    <td className="text-muted">{[r.city, r.address].filter(Boolean).join(", ") || "—"}</td>
                    <td className="text-muted">{r.phone ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            {rows.length} партньора{rows.length > 10 ? " (показани първите 10)" : ""}. Съвпадение по ЕИК, иначе по име — съществуващите се допълват. ЕИК и ДДС № се проверяват.
          </p>
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <SubmitButton>Импортирай {rows.length} партньора</SubmitButton>
        </>
      )}
    </Form>
  );
}
