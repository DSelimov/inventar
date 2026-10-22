"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/action";

type Office = { code: string; name: string; city: string; locker: boolean };

/** Товарителница: куриер, офис/автомат (със списък) или адрес, тегло, брой пакети, наложен платеж. */
export function WaybillForm(props: { couriers: Array<{ id: string; name: string; officesOnly: boolean; offices: Office[] }>; phone: string; cod: number | null; weight: number; action: (fd: FormData) => Promise<ActionResult> }) {
  const [provider, setProvider] = useState(props.couriers[0]?.id ?? "");
  const [toOffice, setToOffice] = useState(true);
  const courier = props.couriers.find((c) => c.id === provider);
  const office = courier?.officesOnly || toOffice;
  return (
    <Form action={props.action} className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Select name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Куриер">
          {props.couriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {!courier?.officesOnly && (
          <Select value={toOffice ? "office" : "address"} onChange={(e) => setToOffice(e.target.value === "office")} aria-label="Доставка">
            <option value="office">до офис / автомат</option>
            <option value="address">до адрес</option>
          </Select>
        )}
      </div>
      {office ? (
        <Field label={courier?.officesOnly ? "Автомат" : "Офис или автомат"} hint={courier?.offices.length ? `${courier.offices.length} в списъка — пишете град или име.` : "Въведете кода на офиса."}>
          <Input name="officeCode" list={`offices-${provider}`} required placeholder="код · име" autoComplete="off" />
          <datalist id={`offices-${provider}`}>
            {courier?.offices.map((o) => (
              <option key={o.code} value={`${o.code} · ${o.city} · ${o.name}${o.locker ? " (автомат)" : ""}`} />
            ))}
          </datalist>
        </Field>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Input name="city" required placeholder="Град" className="col-span-2" aria-label="Град" />
          <Input name="postCode" placeholder="ПК" aria-label="Пощенски код" />
          <Input name="street" required placeholder="Улица / ж.к." className="col-span-2" aria-label="Улица" />
          <Input name="num" placeholder="№" aria-label="Номер" />
          <Input name="other" placeholder="Блок, вход, етаж…" className="col-span-3" aria-label="Допълнително" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Телефон на получателя">
          <Input name="phone" required defaultValue={props.phone} inputMode="tel" />
        </Field>
        <Field label="Наложен платеж" hint="Празно = без">
          <Input name="cod" type="number" min={0} step="0.01" defaultValue={props.cod ?? ""} />
        </Field>
        <Field label="Тегло, кг">
          <Input name="weight" type="number" min="0.01" step="0.01" required defaultValue={props.weight} />
        </Field>
        <Field label="Пакети">
          <Input name="parcels" type="number" min={1} defaultValue={1} required />
        </Field>
      </div>
      <SubmitButton className="w-full">Създай товарителница</SubmitButton>
    </Form>
  );
}
