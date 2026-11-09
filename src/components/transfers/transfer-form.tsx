"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Plus, ScanLine, Trash2 } from "lucide-react";
import { Scanner } from "@/components/scan/scanner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/action";
import { itemDecimals, quantityStep } from "@/lib/quantity";
import { beep, buildCodeIndex, type CodeUnit } from "@/lib/scan-codes";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type TrackingMode = "none" | "lot" | "serial";
export type TransferItem = { id: number; sku: string; barcode: string | null; name: string; variant: string | null; unit: string; tracking: TrackingMode; quantityDecimals: number };
export type TransferLevel = { itemId: number; locationId: number; quantity: number };
export type TransferLot = { id: number; itemId: number; locationId: number; lotNumber: string; expiryDate: string | null; quantity: number };
type Line = { key: number; itemId: string; quantity: string; lotId: string };

/** Сума на количества в браузъра (до 3 знака), без грешки от плаваща запетая. */
const add = (a: number, b: number) => Math.round((a + b) * 1000) / 1000;

export function TransferForm({
  items,
  levels,
  lots,
  units,
  locations,
  initial,
  action,
  cancelHref,
}: {
  items: TransferItem[];
  levels: TransferLevel[];
  lots: TransferLot[];
  units: CodeUnit[];
  locations: Array<{ id: number; name: string; isDefault: boolean }>;
  initial?: { fromLocationId: number; toLocationId: number; notes: string | null; lines: Array<{ itemId: number; quantity: number; lotId: number | null }> };
  action: (fd: FormData) => Promise<ActionResult>;
  cancelHref: string;
}) {
  const defFrom = initial?.fromLocationId ?? locations.find((l) => l.isDefault)?.id ?? locations[0]?.id;
  const [from, setFrom] = useState(String(defFrom ?? ""));
  const [to, setTo] = useState(String(initial?.toLocationId ?? locations.find((l) => l.id !== defFrom)?.id ?? ""));
  const keyRef = useRef(initial?.lines.length ?? 1);
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.length ? initial.lines.map((l, i) => ({ key: i, itemId: String(l.itemId), quantity: String(l.quantity), lotId: l.lotId ? String(l.lotId) : "" })) : [],
  );
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  // камерата държи първоначалния onCode — текущите редове се четат от ref
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const lookup = useMemo(() => buildCodeIndex(items, units), [items, units]);
  const available = (itemId: number, lotId: string) => {
    if (lotId) return lots.find((l) => String(l.id) === lotId)?.quantity ?? 0;
    return levels.find((l) => l.itemId === itemId && String(l.locationId) === from)?.quantity ?? 0;
  };
  const label = (i: TransferItem) => (i.variant ? `${i.name} · ${i.variant}` : i.name);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = (itemId = "", quantity = "1") => setLines((ls) => [...ls, { key: keyRef.current++, itemId, quantity, lotId: "" }]);

  const onScan = (code: string) => {
    const hit = lookup(code);
    if (!hit) {
      beep(false);
      setLast({ ok: false, text: `Няма артикул с код „${code}“.` });
      return;
    }
    const item = byId.get(hit.itemId)!;
    const existing = linesRef.current.find((l) => l.itemId === String(hit.itemId) && !l.lotId);
    const total = add(Number(existing?.quantity || 0), hit.factor);
    if (existing) {
      update(existing.key, { quantity: String(total) });
      linesRef.current = linesRef.current.map((l) => (l.key === existing.key ? { ...l, quantity: String(total) } : l));
    } else {
      const line = { key: keyRef.current++, itemId: String(hit.itemId), quantity: String(hit.factor), lotId: "" };
      setLines((ls) => [...ls, line]);
      linesRef.current = [...linesRef.current, line];
    }
    const stock = available(item.id, "");
    const short = total > stock;
    beep(!short);
    setLast({
      ok: !short,
      text: `${label(item)}: +${formatNumber(hit.factor)} ${item.unit}${hit.pack ? ` (${hit.pack})` : ""} → ${formatNumber(total)}${short ? ` — в изходния обект има само ${formatNumber(stock)}` : ""}`,
    });
  };

  const totalUnits = lines.reduce((s, l) => add(s, Number(l.quantity) || 0), 0);
  const fromName = locations.find((l) => String(l.id) === from)?.name;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ScanLine className="h-4 w-4" /> Добавяне със скенер
        </h2>
        <Scanner onCode={onScan} continuous />
        {last && (
          <p role="status" className={cn("mt-3 rounded px-3 py-2 text-sm", last.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
            {last.text}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">Всяко сканиране добавя една бройка — или цялата опаковка, ако е сканиран баркодът на кашон или палет.</p>
      </section>

      <Form action={action} className="space-y-6" resetOnSuccess={false}>
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <Field label="От">
              <Select name="fromLocationId" value={from} onChange={(e) => setFrom(e.target.value)} required>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <ArrowRight className="mb-2.5 hidden h-5 w-5 text-muted sm:block" />
            <Field label="Към">
              <Select name="toLocationId" value={to} onChange={(e) => setTo(e.target.value)} required>
                {locations.map((l) => (
                  <option key={l.id} value={l.id} disabled={String(l.id) === from}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Бележка" className="sm:col-span-3">
              <Textarea name="notes" defaultValue={initial?.notes ?? ""} className="min-h-16" placeholder="Зареждане на аптеката, заявка №…" />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Стока</h2>
            <span className="text-sm text-muted">
              {lines.length} реда · {formatNumber(totalUnits)} единици
            </span>
          </div>
          {lines.length === 0 && <p className="mb-3 text-sm text-muted">Сканирайте артикулите или ги добавете ръчно с „Добави ред“.</p>}
          <div className="space-y-2">
            {lines.map((line) => {
              const chosen = byId.get(Number(line.itemId));
              const tracked = chosen && chosen.tracking !== "none";
              const lineLots = chosen ? lots.filter((l) => l.itemId === chosen.id && String(l.locationId) === from) : [];
              const stock = chosen ? available(chosen.id, line.lotId) : 0;
              const qty = Number(line.quantity) || 0;
              return (
                <div key={line.key} className="grid grid-cols-1 items-start gap-2 border-b border-line pb-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_7rem_2.5rem]">
                  <div>
                    <Select name="lineItemId" required value={line.itemId} onChange={(e) => update(line.key, { itemId: e.target.value, lotId: "" })}>
                      <option value="" disabled>
                        Изберете артикул…
                      </option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {label(i)} ({i.sku})
                        </option>
                      ))}
                    </Select>
                    {chosen && (
                      <p className={cn("mt-1 text-xs", qty > stock ? "font-bold text-danger" : "text-muted")}>
                        Налично в „{fromName}“: {formatNumber(stock)} {chosen.unit}
                        {qty > stock && " — недостатъчно"}
                      </p>
                    )}
                  </div>
                  <div>
                    {tracked ? (
                      <Select name="lineLotId" value={line.lotId} onChange={(e) => update(line.key, { lotId: e.target.value, quantity: chosen.tracking === "serial" && e.target.value ? "1" : line.quantity })} aria-label="Партида">
                        <option value="">{chosen.tracking === "serial" ? "Автоматично" : "По най-близък срок"}</option>
                        {lineLots.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.lotNumber}
                            {l.expiryDate ? ` · до ${formatDate(l.expiryDate, "dd.MM.yyyy")}` : ""} · {formatNumber(l.quantity)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <>
                        <input type="hidden" name="lineLotId" value="" />
                        <span className="hidden text-sm text-muted sm:block sm:py-2">—</span>
                      </>
                    )}
                  </div>
                  <Input
                    name="lineQuantity"
                    type="number"
                    min={0}
                    step={quantityStep(chosen ? itemDecimals(chosen) : 0)}
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                    required
                    aria-label="Количество"
                  />
                  <Button variant="ghost" onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))} aria-label="Премахни реда" title="Премахни реда">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => addLine()}>
            <Plus className="h-4 w-4" /> Добави ред
          </Button>
        </section>

        <FormActions>
          <ButtonLink href={cancelHref} variant="secondary">
            Отказ
          </ButtonLink>
          <SubmitButton variant="secondary" name="intent" value="save">
            Запази чернова
          </SubmitButton>
          <SubmitButton name="intent" value="complete">
            Изпълни трансфера
          </SubmitButton>
        </FormActions>
      </Form>
    </div>
  );
}
