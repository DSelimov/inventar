import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { convertToEuro, saveCompanyDetails, saveOrganization, saveReportParameters } from "@/lib/actions/settings";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompanyDetails, getSettings } from "@/lib/settings";
import { rootUrl, tenantUrl } from "@/lib/tenant";
import { Form } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { CURRENCIES } from "@/lib/currency";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const ctx = await requireContext();
  const [s, company] = await Promise.all([getSettings(ctx.db), getCompanyDetails(ctx.db)]);
  const manage = can(ctx.role, "manage");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Организация" description="Име и валута на фирмата." />
        <CardBody>
          <Form action={saveOrganization} className="space-y-4">
            <Field label="Име на фирмата">
              <Input name="name" defaultValue={ctx.org.name} required disabled={!manage} />
            </Field>
            <Field label="Валута" hint="Сменя се само преди да има цени и поръчки — сумите не се преизчисляват.">
              <Select name="currency" defaultValue={ctx.org.currency} className="w-64" disabled={!manage}>
                {ctx.org.currency === "BGN" && <option value="BGN">Български лев (до превалутирането)</option>}
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox name="lowStockAlerts" defaultChecked={s.lowStockAlerts} label="Показвай артикулите с ниска наличност на таблото" disabled={!manage} />
            {manage && (
              <div className="flex justify-end border-t border-line pt-4">
                <SubmitButton>Запази</SubmitButton>
              </div>
            )}
          </Form>
          {ctx.org.currency === "BGN" && (
            <Form action={convertToEuro} className="mt-4 space-y-2 rounded-xl bg-warning-soft p-4 text-sm">
              <p className="font-medium text-warning">От 1 януари 2026 г. България е в еврозоната.</p>
              <p className="text-muted">
                Превалутирането преизчислява всички цени и поръчки по курс 1 € = 1,95583 лв. Продажните цени се закръглят до стотинка,
                доставните пазят 4 знака; поръчките запазват и сумите в лева. Действието е еднократно.
              </p>
              {ctx.role === "owner" ? (
                <ConfirmButton variant="secondary" size="sm" message="Да превалутирам ли всички цени и поръчки от лева в евро? Действието е еднократно.">
                  Превалутирай в евро
                </ConfirmButton>
              ) : (
                <p className="text-muted">Само собственикът на организацията може да го направи.</p>
              )}
            </Form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Данни за документи" description="Печатат се в стоковите разписки и справките (PDF)." />
        <CardBody>
          <Form action={saveCompanyDetails} className="grid gap-4 sm:grid-cols-2">
            <Field label="Фирма (юридическо име)" className="sm:col-span-2">
              <Input name="legalName" defaultValue={company.legalName} placeholder={ctx.org.name} disabled={!manage} />
            </Field>
            <Field label="ЕИК">
              <Input name="eik" defaultValue={company.eik} inputMode="numeric" disabled={!manage} />
            </Field>
            <Field label="ДДС №">
              <Input name="vatNumber" defaultValue={company.vatNumber} placeholder="BG…" disabled={!manage} />
            </Field>
            <Field label="Адрес" className="sm:col-span-2">
              <Input name="address" defaultValue={company.address} disabled={!manage} />
            </Field>
            <Field label="Телефон">
              <Input name="phone" defaultValue={company.phone} disabled={!manage} />
            </Field>
            <Field label="МОЛ">
              <Input name="mol" defaultValue={company.mol} disabled={!manage} />
            </Field>
            {manage && (
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton variant="secondary">Запази</SubmitButton>
              </div>
            )}
          </Form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Параметри за анализи" description="Използват се в Отчети за оборот, залежала стока и предложения за поръчка." />
        <CardBody>
          <Form action={saveReportParameters} className="grid gap-4 sm:grid-cols-2">
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
          </Form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Вашият профил" description={`${ctx.user.name} · ${ctx.user.email}`} />
        <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted">Име, парола, двуфакторна защита, активни сесии и имейли.</span>
          <ButtonLink href="/profile" variant="secondary" size="sm">
            Към профила
          </ButtonLink>
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
