import type { Partner } from "@/db/schema";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
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
      <Field label="ЕИК / ДДС номер">
        <Input name="vatNumber" defaultValue={partner?.vatNumber ?? ""} className="font-mono" />
      </Field>
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
