"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, Plus, RotateCcw, ScanLine, Trash2 } from "lucide-react";
import { Scanner } from "@/components/scan/scanner";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import type { ActionResult } from "@/lib/action";
import { itemDecimals, quantityStep } from "@/lib/quantity";
import { beep, buildCodeIndex, type CodeUnit } from "@/lib/scan-codes";
import { cn, formatNumber } from "@/lib/utils";

type TrackingMode = "none" | "lot" | "serial";
export type ReceiveItem = { id: number; sku: string; barcode: string | null; name: string; variant: string | null; unit: string; tracking: TrackingMode; quantityDecimals: number };
export type ExpectedLine = { id: number; itemId: number; quantity: number; lotNumber: string | null; expiryDate: string | null };
type Row = { key: number; itemId: number; expected: number; counted: number; lotNumber: string; expiryDate: string; sourceLineId: number | null };

const add = (a: number, b: number) => Math.round((a + b) * 1000) / 1000;

/** Приемане на входяща пратка: всяко сканиране брои полученото; разликите спрямо очакваното се виждат веднага. */
export function ReceiveForm({ shipmentId, expected, items, units, action, cancelHref }: { shipmentId: number; expected: ExpectedLine[]; items: ReceiveItem[]; units: CodeUnit[]; action: (fd: FormData) => Promise<ActionResult>; cancelHref: string }) {
  const storageKey = `receive-${shipmentId}`;
  const initialRows = (): Row[] =>
    expected.map((l, i) => ({ key: i, itemId: l.itemId, expected: l.quantity, counted: 0, lotNumber: l.lotNumber ?? "", expiryDate: l.expiryDate ?? "", sourceLineId: l.id }));
  const [rows, setRows] = useState<Row[]>(initialRows);
  const keyRef = useRef(expected.length);
  const rowsRef = useRef(rows);
  const [last, setLast] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const restored = useRef(false);

  // незавършеното броене се пази в браузъра — презареждане на страницата не губи сканираното
  useEffect(() => {
    rowsRef.current = rows;
    if (!restored.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(rows));
    } catch {
      /* без localStorage */
    }
  }, [rows, storageKey]);
  useEffect(() => {
    restored.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Row[] | null;
      if (Array.isArray(saved) && saved.some((r) => r.counted > 0)) {
        keyRef.current = Math.max(0, ...saved.map((r) => r.key)) + 1;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- еднократно възстановяване от localStorage
        setRows(saved);
        setLast({ tone: "warn", text: "Продължавате незавършено броене от този браузър. „Започни отначало“ го изчиства." });
      }
    } catch {
      /* без localStorage */
    }
  }, [storageKey]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const lookup = useMemo(() => buildCodeIndex(items, units), [items, units]);
  const label = (i: ReceiveItem | undefined) => (i ? (i.variant ? `${i.name} · ${i.variant}` : i.name) : "?");
  const setAll = (next: Row[]) => {
    rowsRef.current = next;
    setRows(next);
  };
  const patch = (key: number, p: Partial<Row>) => setAll(rowsRef.current.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const onScan = (code: string) => {
    const hit = lookup(code);
    if (!hit) {
      beep(false);
      setLast({ tone: "error", text: `Няма артикул с код „${code}“. Проверете баркода или добавете артикула.` });
      return;
    }
    const item = byId.get(hit.itemId);
    const current = rowsRef.current;
    const forItem = current.filter((r) => r.itemId === hit.itemId);
    // първо ред, на който още не е стигнато очакваното, иначе последният ред на артикула
    const target = forItem.find((r) => r.counted < r.expected) ?? forItem[forItem.length - 1];
    let counted: number;
    let expectedTotal: number;
    if (target) {
      counted = add(target.counted, hit.factor);
      setAll(current.map((r) => (r.key === target.key ? { ...r, counted } : r)));
      expectedTotal = forItem.reduce((s, r) => add(s, r.expected), 0);
    } else {
      counted = hit.factor;
      setAll([...current, { key: keyRef.current++, itemId: hit.itemId, expected: 0, counted, lotNumber: "", expiryDate: "", sourceLineId: null }]);
      expectedTotal = 0;
    }
    const countedTotal = add(forItem.reduce((s, r) => add(s, r.counted), 0), hit.factor);
    const unit = item?.unit ?? "";
    const pack = hit.pack ? ` (${hit.pack})` : "";
    if (!target) {
      beep(false);
      setLast({ tone: "warn", text: `${label(item)}: +${formatNumber(hit.factor)} ${unit}${pack} — НЕ Е В ПРАТКАТА, добавен е като излишък.` });
    } else if (countedTotal > expectedTotal) {
      beep(false);
      setLast({ tone: "warn", text: `${label(item)}: ${formatNumber(countedTotal)} от ${formatNumber(expectedTotal)} ${unit}${pack} — повече от очакваното.` });
    } else {
      beep(true);
      setLast({ tone: "ok", text: `${label(item)}: ${formatNumber(countedTotal)} от ${formatNumber(expectedTotal)} ${unit}${pack}${countedTotal === expectedTotal ? " ✓" : ""}` });
    }
  };

  const totals = rows.reduce((t, r) => ({ expected: add(t.expected, r.expected), counted: add(t.counted, r.counted) }), { expected: 0, counted: 0 });
  // разлики по артикул (няколко реда/партиди на един артикул се сумират)
  const perItem = new Map<number, { expected: number; counted: number }>();
  for (const r of rows) {
    const p = perItem.get(r.itemId) ?? { expected: 0, counted: 0 };
    perItem.set(r.itemId, { expected: add(p.expected, r.expected), counted: add(p.counted, r.counted) });
  }
  const diffs = [...perItem.entries()].filter(([, p]) => p.counted !== p.expected).map(([id, p]) => `${label(byId.get(id))}: ${p.counted > p.expected ? "+" : ""}${formatNumber(add(p.counted, -p.expected))}`);
  const missingLot = rows.some((r) => r.counted > 0 && byId.get(r.itemId)?.tracking !== "none" && !r.lotNumber.trim());
  const payload = JSON.stringify(rows.filter((r) => r.counted > 0).map((r) => ({ itemId: r.itemId, quantity: r.counted, lotNumber: r.lotNumber, expiryDate: r.expiryDate, sourceLineId: r.sourceLineId })));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ScanLine className="h-4 w-4" /> Сканирайте получената стока
        </h2>
        <Scanner onCode={onScan} continuous />
        {last && (
          <p
            role="status"
            className={cn("mt-3 rounded px-3 py-2 text-sm font-medium", last.tone === "ok" ? "bg-success-soft text-success" : last.tone === "warn" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}
          >
            {last.text}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">Всяко сканиране добавя една бройка — или цялата опаковка (кашон, палет), ако е сканиран нейният баркод. Количеството може да се поправи и ръчно.</p>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-line bg-surface px-4 py-3">
          <div className="text-xs text-muted">Очаквано</div>
          <div className="text-xl font-semibold tabular-nums">{formatNumber(totals.expected)}</div>
        </div>
        <div className="rounded-lg border border-line bg-surface px-4 py-3">
          <div className="text-xs text-muted">Преброено</div>
          <div className="text-xl font-semibold tabular-nums">{formatNumber(totals.counted)}</div>
        </div>
        <div className={cn("rounded-lg border px-4 py-3", diffs.length ? "border-warning-solid bg-warning-soft" : "border-line bg-surface")}>
          <div className="text-xs text-muted">Артикули с разлика</div>
          <div className={cn("text-xl font-semibold tabular-nums", diffs.length > 0 && "text-warning")}>{diffs.length}</div>
        </div>
      </div>

      <section className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="table">
          <thead>
            <tr>
              <th>Артикул</th>
              <th>Партида / срок</th>
              <th className="text-right">Очаквано</th>
              <th className="text-right">Получено</th>
              <th className="text-right">Разлика</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const item = byId.get(r.itemId);
              const diff = add(r.counted, -r.expected);
              const tracked = item && item.tracking !== "none";
              return (
                <tr key={r.key} className={cn(r.counted === 0 && r.expected > 0 && "opacity-70", r.expected === 0 && "bg-warning-soft/50")}>
                  <td>
                    <div>{label(item)}</div>
                    <div className="font-mono text-xs text-muted">
                      {item?.sku}
                      {item?.barcode && ` · ${item.barcode}`}
                    </div>
                    {r.expected === 0 && <div className="text-xs font-bold text-warning">не е в пратката</div>}
                  </td>
                  <td className="min-w-56">
                    {tracked ? (
                      <div className="space-y-1">
                        <Input
                          value={r.lotNumber}
                          onChange={(e) => patch(r.key, { lotNumber: e.target.value })}
                          placeholder={item.tracking === "serial" ? "Серийни номера, със запетая" : "Партида №"}
                          className={cn("font-mono", r.counted > 0 && !r.lotNumber.trim() && "border-danger-solid")}
                          aria-label="Партида"
                        />
                        {item.tracking === "lot" && <Input type="date" value={r.expiryDate} onChange={(e) => patch(r.key, { expiryDate: e.target.value })} aria-label="Срок на годност" />}
                        <button
                          type="button"
                          className="text-xs text-accent hover:underline"
                          onClick={() => setAll([...rowsRef.current, { key: keyRef.current++, itemId: r.itemId, expected: 0, counted: 0, lotNumber: "", expiryDate: "", sourceLineId: r.sourceLineId }])}
                        >
                          + друга партида
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{r.expected ? `${formatNumber(r.expected)} ${item?.unit ?? ""}` : "—"}</td>
                  <td className="w-32 text-right">
                    <Input
                      type="number"
                      min={0}
                      step={quantityStep(item ? itemDecimals(item) : 0)}
                      value={r.counted}
                      onChange={(e) => patch(r.key, { counted: Math.max(0, Number(e.target.value) || 0) })}
                      className="text-right font-bold tabular-nums"
                      aria-label="Получено"
                    />
                  </td>
                  <td className={cn("text-right font-bold tabular-nums", diff < 0 ? "text-danger" : diff > 0 ? "text-warning" : "text-success")}>{diff === 0 ? "✓" : `${diff > 0 ? "+" : ""}${formatNumber(diff)}`}</td>
                  <td>
                    {(r.expected === 0 || rows.filter((x) => x.itemId === r.itemId).length > 1) && (
                      <Button variant="ghost" size="sm" onClick={() => setAll(rowsRef.current.filter((x) => x.key !== r.key))} aria-label="Премахни реда" title="Премахни реда">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAll(rowsRef.current.map((r) => ({ ...r, counted: r.expected })))}>
          <CheckCheck className="h-4 w-4" /> Получено = очаквано
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            try {
              localStorage.removeItem(storageKey);
            } catch {
              /* без localStorage */
            }
            setAll(initialRows());
            setLast(null);
          }}
        >
          <RotateCcw className="h-4 w-4" /> Започни отначало
        </Button>
      </div>

      <Form
        action={async (fd) => {
          const r = await action(fd);
          if (!r?.error) {
            try {
              localStorage.removeItem(storageKey);
            } catch {
              /* без localStorage */
            }
          }
          return r;
        }}
        resetOnSuccess={false}
        className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4"
      >
        <input type="hidden" name="rows" value={payload} />
        {missingLot && <p className="mr-auto text-sm font-bold text-danger">Въведете партида за всички артикули с партиди.</p>}
        {!missingLot && diffs.length > 0 && <p className="mr-auto text-sm text-warning">Разликите ще се запишат в бележката на пратката.</p>}
        <ButtonLink href={cancelHref} variant="secondary">
          Отказ
        </ButtonLink>
        <ConfirmButton
          disabled={totals.counted === 0 || missingLot}
          message={
            diffs.length
              ? `Има разлики спрямо очакваното:\n${diffs.slice(0, 15).join("\n")}${diffs.length > 15 ? "\n…" : ""}\n\nДа заприходя ли преброеното?`
              : "Да заприходя ли получената стока? Наличността се увеличава веднага."
          }
        >
          <Plus className="h-4 w-4" /> Приеми стоката
        </ConfirmButton>
      </Form>
    </div>
  );
}
