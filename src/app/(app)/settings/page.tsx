import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { changeOwnPassword } from "@/lib/actions/members";
import { saveOrganization, saveReportParameters } from "@/lib/actions/settings";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { rootUrl, tenantUrl } from "@/lib/tenant";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const ctx = await requireContext();
  const s = await getSettings(ctx.db);
  const manage = can(ctx.role, "manage");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Организация" description="Име и валута на фирмата." />
        <CardBody>
          <form action={saveOrganization} className="space-y-4">
            <Field label="Име на фирмата">
              <Input name="name" defaultValue={ctx.org.name} required disabled={!manage} />
            </Field>
            <Field label="Валута" hint="ISO 4217 код, напр. EUR, BGN, USD.">
              <Input name="currency" defaultValue={ctx.org.currency} maxLength={3} className="w-28 uppercase" disabled={!manage} />
            </Field>
            <Checkbox name="lowStockAlerts" defaultChecked={s.lowStockAlerts} label="Показвай артикулите с ниска наличност на таблото" disabled={!manage} />
            {manage && (
              <div className="flex justify-end border-t border-line pt-4">
                <SubmitButton>Запази</SubmitButton>
              </div>
            )}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Параметри за анализи" description="Използват се в Отчети за оборот, залежала стока и предложения за поръчка." />
        <CardBody>
          <form action={saveReportParameters} className="grid gap-4 sm:grid-cols-2">
            <Field label="Прозорец за анализ (дни)" hint="Период за оборот и средна дневна консумация.">
              <Input name="windowDays" type="number" min={1} defaultValue={s.windowDays} disabled={!manage} />
            </Field>
            <Field label="Залежала стока след (дни)" hint="Без разход за толкова дни.">
              <Input name="deadStockDays" type="number" min={1} defaultValue={s.deadStockDays} disabled={!manage} />
            </Field>
            <Field label="Срок на доставка по подразбиране (дни)" hint="Ако партньорът няма зададен.">
              <Input name="leadTimeDays" type="number" min={1} defaultValue={s.leadTimeDays} disabled={!manage} />
            </Field>
            <Field label="Буфер за сигурност (дни)" hint="Допълнително покритие при предложения за поръчка.">
              <Input name="safetyDays" type="number" min={1} defaultValue={s.safetyDays} disabled={!manage} />
            </Field>
            <Field label="Целеви марж (%)" hint="Категории под целта се маркират.">
              <Input name="targetMarginPct" type="number" min={1} max={99} defaultValue={s.targetMarginPct} disabled={!manage} />
            </Field>
            {manage && (
              <div className="flex items-end justify-end">
                <SubmitButton variant="secondary">Запази параметрите</SubmitButton>
              </div>
            )}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Вашият профил" description={`${ctx.user.name} · ${ctx.user.email}`} />
        <CardBody>
          <form action={changeOwnPassword} className="flex flex-wrap items-end gap-3">
            <Field label="Нова парола" className="min-w-60 flex-1">
              <Input name="password" type="password" minLength={8} required autoComplete="new-password" />
            </Field>
            <SubmitButton variant="secondary">Смени паролата</SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Организации" description={`Адрес на тази организация: ${tenantUrl(ctx.org.subdomain)}`} />
        <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted">Всяка организация има собствена база данни и собствен поддомейн. Нова организация се създава от портала.</p>
          <a href={rootUrl("/portal")} className="font-medium text-accent hover:underline">
            Към портала →
          </a>
        </CardBody>
      </Card>
    </div>
  );
}
