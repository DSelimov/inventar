import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveSettings } from "@/lib/actions/settings";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Настройки" description="Предпочитания на работното пространство. Потребители, роли и параметри за анализи идват във втория етап." />
      <Card>
        <CardHeader title="Фирма" />
        <CardBody>
          <form action={saveSettings} className="space-y-4">
            <Field label="Име на фирмата" hint="Показва се в страничното меню.">
              <Input name="companyName" defaultValue={s.companyName} required />
            </Field>
            <Field label="Валута" hint="ISO 4217 код, напр. EUR, BGN, USD.">
              <Input name="currency" defaultValue={s.currency} maxLength={3} className="w-28 uppercase" />
            </Field>
            <Checkbox name="lowStockAlerts" defaultChecked={s.lowStockAlerts} label="Показвай артикулите с ниска наличност на таблото" />
            <div className="flex justify-end border-t border-line pt-4">
              <SubmitButton>Запази настройките</SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
