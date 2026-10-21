import type { Partner } from "@/db/schema";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";

export function PartnerFields({ partner, submitLabel }: { partner?: Partner; submitLabel: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Име" className="sm:col-span-2">
        <Input name="name" required defaultValue={partner?.name} placeholder="Фирма или лице" />
      </Field>
      <Field label="Тип">
        <Select name="type" defaultValue={partner?.type ?? "both"}>
          <option value="supplier">Доставчик</option>
          <option value="customer">Клиент</option>
          <option value="both">Доставчик и клиент</option>
        </Select>
      </Field>
      <Field label="Срок на доставка (дни)" hint="За предложенията за поръчка в Отчети.">
        <Input name="leadTimeDays" type="number" min={0} defaultValue={partner?.leadTimeDays ?? ""} />
      </Field>
      <Field label="Лице за контакт">
        <Input name="contactName" defaultValue={partner?.contactName ?? ""} />
      </Field>
      <Field label="ЕИК" hint="9 или 13 цифри; за физически лица — ЕГН.">
        <Input name="eik" defaultValue={partner?.eik ?? ""} inputMode="numeric" className="font-mono" />
      </Field>
      <Field label="ДДС номер" hint="Празно при регистрирано българско лице = BG + ЕИК.">
        <Input name="vatNumber" defaultValue={partner?.vatNumber ?? ""} placeholder="BG…" className="font-mono uppercase" />
      </Field>
      <Field label="Държава" hint="Двубуквен код (BG, RO, DE…).">
        <Input name="country" defaultValue={partner?.country ?? "BG"} maxLength={2} className="w-20 font-mono uppercase" />
      </Field>
      <div className="flex items-end pb-2">
        <Checkbox name="vatRegistered" defaultChecked={partner?.vatRegistered ?? false} label="Регистриран по ЗДДС" />
      </div>
      <Field label="Имейл">
        <Input name="email" type="email" defaultValue={partner?.email ?? ""} />
      </Field>
      <Field label="Телефон">
        <Input name="phone" defaultValue={partner?.phone ?? ""} />
      </Field>
      <Field label="Адрес" className="sm:col-span-2">
        <Input name="address" defaultValue={partner?.address ?? ""} />
      </Field>
      <Field label="Бележки" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={partner?.notes ?? ""} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </div>
  );
}
