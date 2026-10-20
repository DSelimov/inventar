"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Location, Shipment, ShipmentDirection, TrackingMode } from "@/db/schema";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";

export type ItemOption = { id: number; name: string; sku: string; unit: string; quantity: number; tracking: TrackingMode; variantLabel: string | null };
export type LotOption = { id: number; itemId: number; locationId: number; lotNumber: string; quantity: number; expiryDate: string | null };
export type PartnerOption = { id: number; name: string; type: string };
type Line = { key: number; itemId: string; quantity: string; lotNumber: string; expiryDate: string; lotId: string };

export function ShipmentForm({
  items,
  locations,
  partners,
  lots,
  shipment,
  initialLines,
  initialDirection = "inbound",
  linesEditable = true,
  orderId,
  action,
  cancelHref,
}: {
  items: ItemOption[];
  locations: Location[];
  partners: PartnerOption[];
  lots: LotOption[];
  shipment?: Shipment;
  initialLines?: { itemId: number; quantity: number; lotNumber?: string | null; expiryDate?: string | null; lotId?: number | null }[];
  initialDirection?: ShipmentDirection;
  linesEditable?: boolean;
  orderId?: number | null;
  action: (fd: FormData) => Promise<void>;
  cancelHref: string;
}) {
  const [direction, setDirection] = useState<ShipmentDirection>(shipment?.direction ?? initialDirection);
  const [locationId, setLocationId] = useState<string>(String(shipment?.locationId ?? locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? ""));
  const [lines, setLines] = useState<Line[]>(() =>
    (initialLines?.length ? initialLines : [{ itemId: 0, quantity: 1 }]).map((l, i) => ({
      key: i,
      itemId: l.itemId ? String(l.itemId) : "",
      quantity: String(l.quantity),
      lotNumber: l.lotNumber ?? "",
      expiryDate: l.expiryDate ?? "",
      lotId: l.lotId ? String(l.lotId) : "",
    })),
  );

  const addLine = () => setLines((ls) => [...ls, { key: Date.now(), itemId: "", quantity: "1", lotNumber: "", expiryDate: "", lotId: "" }]);
  const removeLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const totalUnits = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const inbound = direction === "inbound";
  const partnerList = partners.filter((p) => p.type === "both" || p.type === (inbound ? "supplier" : "customer"));
  const itemLabel = (i: ItemOption) => `${i.name}${i.variantLabel ? ` · ${i.variantLabel}` : ""} (${i.sku}) · ${i.quantity} ${i.unit}`;

  return (
    <form action={action} className="space-y-6">
      {orderId && <input type="hidden" name="orderId" value={orderId} />}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Пратка</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Посока">
            <Select name="direction" value={direction} onChange={(e) => setDirection(e.target.value as ShipmentDirection)} disabled={!linesEditable}>
              <option value="inbound">Входяща · получаване на стока</option>
              <option value="outbound">Изходяща · изпращане на стока</option>
            </Select>
            {!linesEditable && <input type="hidden" name="direction" value={direction} />}
          </Field>
          <Field label="Референция" hint="Ваш номер: поръчка, заявка или фактура.">
            <Input name="reference" required defaultValue={shipment?.reference} placeholder={inbound ? "ПЗ-2026-001" : "ПР-2026-001"} />
          </Field>
          <Field label={inbound ? "Локация на получаване" : "Локация на изпращане"}>
            <Select name="locationId" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!linesEditable}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            {!linesEditable && <input type="hidden" name="locationId" value={locationId} />}
          </Field>
          <Field label={inbound ? "Доставчик" : "Клиент"} hint="От списъка с партньори или свободен текст отдолу.">
            <Select name="partnerId" defaultValue={shipment?.partnerId ?? ""}>
              <option value="">— без партньор от списъка —</option>
              {partnerList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={inbound ? "Доставчик (текст)" : "Клиент (текст)"}>
            <Input name="partner" defaultValue={shipment?.partner ?? ""} placeholder="Фирма или лице" />
          </Field>
          <Field label="Очаквана дата">
            <Input name="expectedDate" type="date" defaultValue={shipment?.expectedDate ?? ""} />
          </Field>
          <Field label="Куриер">
            <Input name="carrier" defaultValue={shipment?.carrier ?? ""} placeholder="Еконт, Спиди, собствен транспорт…" />
          </Field>
          <Field label="Номер за проследяване">
            <Input name="trackingNumber" defaultValue={shipment?.trackingNumber ?? ""} className="font-mono" />
          </Field>
          <Field label="Бележки" className="sm:col-span-2">
            <Textarea name="notes" defaultValue={shipment?.notes ?? ""} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Редове</h2>
            <p className="text-xs text-muted">{linesEditable ? "Артикули и количества в пратката." : "Редовете се заключват, когато пратката е доставена или отказана."}</p>
          </div>
          <span className="text-xs text-muted">{totalUnits} единици</span>
        </div>

        <div className="space-y-3">
          {lines.map((line) => {
            const chosen = items.find((i) => String(i.id) === line.itemId);
            const tracked = chosen && chosen.tracking !== "none";
            const insufficient = !inbound && chosen && Number(line.quantity) > chosen.quantity;
            const lineLots = chosen ? lots.filter((l) => l.itemId === chosen.id && String(l.locationId) === locationId) : [];
            return (
              <div key={line.key} className="rounded-xl border border-line p-3">
                <div className="grid grid-cols-[1fr_7rem_2.5rem] items-start gap-2">
                  <div>
                    <Select name="lineItemId" required value={line.itemId} disabled={!linesEditable} onChange={(e) => update(line.key, { itemId: e.target.value, lotId: "" })}>
                      <option value="" disabled>
                        Изберете артикул…
                      </option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {itemLabel(i)}
                        </option>
                      ))}
                    </Select>
                    {insufficient && (
                      <p className="mt-1 text-xs text-warning">
                        В момента на склад има само {chosen.quantity} {chosen.unit}.
                      </p>
                    )}
                  </div>
                  <Input name="lineQuantity" type="number" min={1} step={1} required value={line.quantity} disabled={!linesEditable} onChange={(e) => update(line.key, { quantity: e.target.value })} />
                  <Button variant="ghost" size="md" onClick={() => removeLine(line.key)} disabled={!linesEditable || lines.length === 1} aria-label="Премахни реда">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {/* Always render the three lot fields so FormData indices stay aligned. */}
                {tracked && inbound ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      name="lineLotNumber"
                      className="font-mono"
                      placeholder={chosen.tracking === "serial" ? "Серийни номера, разделени със запетая" : "Партида №"}
                      value={line.lotNumber}
                      required
                      disabled={!linesEditable}
                      onChange={(e) => update(line.key, { lotNumber: e.target.value })}
                    />
                    <Input name="lineExpiryDate" type="date" value={line.expiryDate} disabled={!linesEditable} onChange={(e) => update(line.key, { expiryDate: e.target.value })} />
                    <input type="hidden" name="lineLotId" value="" />
                  </div>
                ) : tracked && !inbound ? (
                  <div className="mt-2">
                    <Select name="lineLotId" required value={line.lotId} disabled={!linesEditable} onChange={(e) => update(line.key, { lotId: e.target.value })}>
                      <option value="" disabled>
                        {lineLots.length ? "Изберете партида / сериен номер…" : "Няма партиди в тази локация"}
                      </option>
                      {lineLots.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.lotNumber} · {l.quantity} бр.{l.expiryDate ? ` · до ${l.expiryDate}` : ""}
                        </option>
                      ))}
                    </Select>
                    <input type="hidden" name="lineLotNumber" value="" />
                    <input type="hidden" name="lineExpiryDate" value="" />
                  </div>
                ) : (
                  <>
                    <input type="hidden" name="lineLotNumber" value="" />
                    <input type="hidden" name="lineExpiryDate" value="" />
                    <input type="hidden" name="lineLotId" value="" />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {linesEditable && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={addLine}>
            <Plus className="h-4 w-4" />
            Добави ред
          </Button>
        )}
      </section>

      <FormActions>
        <ButtonLink href={cancelHref} variant="secondary">
          Отказ
        </ButtonLink>
        <SubmitButton>{shipment ? "Запази промените" : "Създай пратка"}</SubmitButton>
      </FormActions>
    </form>
  );
}
