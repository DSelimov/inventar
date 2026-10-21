"use client";

import { Input, Select } from "@/components/ui/fields";
import { formatNumber } from "@/lib/utils";
import { mulQty } from "@/lib/quantity";

export type PackOption = { id: number; itemId: number; name: string; factor: number };

/**
 * Количество на ред с избор на опаковка: въвежда се в бройки или в опаковки (кашон = 12 бр.), а към
 * сървъра отива основното количество (скрито поле `name`). Без опаковки — обикновено поле.
 */
export function PackQuantity(props: { name: string; quantity: string; packId: string; packs: PackOption[]; unit: string; step: string; disabled?: boolean; onChange: (patch: { quantity?: string; packId?: string }) => void }) {
  const pack = props.packs.find((p) => String(p.id) === props.packId);
  const count = Number(props.quantity.replace(",", ".")) || 0;
  const base = pack ? mulQty(count, pack.factor) : count;
  return (
    <div className="space-y-1">
      <Input
        type="number"
        min={pack ? 1 : props.step}
        step={pack ? 1 : props.step}
        required
        value={props.quantity}
        disabled={props.disabled}
        onChange={(e) => props.onChange({ quantity: e.target.value })}
        aria-label="Количество"
      />
      <input type="hidden" name={props.name} value={pack ? String(base) : props.quantity} />
      {props.packs.length > 0 && (
        <Select value={props.packId} disabled={props.disabled} onChange={(e) => props.onChange({ packId: e.target.value })} aria-label="Мерна единица" className="h-8 text-xs">
          <option value="">{props.unit}</option>
          {props.packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({formatNumber(p.factor)})
            </option>
          ))}
        </Select>
      )}
      {pack && (
        <p className="text-[11px] text-muted">
          = {formatNumber(base)} {props.unit}
        </p>
      )}
    </div>
  );
}
