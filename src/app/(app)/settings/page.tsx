import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { cancelOrganizationDeletion, convertToEuro, requestOrganizationDeletion, saveCompanyDetails, saveOrganization, saveReportParameters } from "@/lib/actions/settings";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompanyDetails, getSettings } from "@/lib/settings";
import { rootUrl, tenantUrl } from "@/lib/tenant";
import { Form } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { CURRENCIES } from "@/lib/currency";
import { count } from "drizzle-orm";
import { stockMovements } from "@/db/tenant-schema";
import { getValuationMethod } from "@/lib/valuation";
import { Download, Trash2 } from "lucide-react";
import { DELETION_GRACE_DAYS } from "@/lib/legal";
import { formatDate } from "@/lib/utils";
import { saveScaleFormats } from "@/lib/actions/scale";
import { getScaleFormats } from "@/lib/scale";
import { SCALE_KIND_LABELS, SCALE_KINDS } from "@/lib/scale-barcode";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const ctx = await requireContext();
  const scaleFormats = await getScaleFormats(ctx.db);
  const [s, company, method, [moved]] = await Promise.all([getSettings(ctx.db), getCompanyDetails(ctx.db), getValuationMethod(ctx.db), ctx.db.select({ n: count() }).from(stockMovements)]);
  const methodLocked = moved.n > 0;
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
            <Field label="Оценка на наличността" hint={methodLocked ? "Избира се преди първото движение и после не се сменя." : "Как се определя себестойността на изписаното."}>
              <Select name="valuationMethod" defaultValue={method} className="w-64" disabled={!manage || methodLocked}>
                <option value="average">Средно претеглена цена</option>
                <option value="fifo">FIFO — първа входяща, първа изходяща</option>
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
            <Form action={convertToEuro} className="mt-4 space-y-2 rounded-lg bg-warning-soft p-4 text-sm">
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
            <Field label="Банка">
              <Input name="bank" defaultValue={company.bank} disabled={!manage} />
            </Field>
            <Field label="IBAN" hint="Печата се във фактурите.">
              <Input name="iban" defaultValue={company.iban} className="font-mono uppercase" disabled={!manage} />
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
        <CardHeader
          title="Везни (етикети с тегло или цена)"
          description="Баркод 2x PPPPP VVVVV C от везната: по PLU на артикула се намира артикулът, а количеството е теглото (или цената ÷ продажната цена). Работи при сканиране, инвентаризация и в мобилния режим."
          actions={
            <ButtonLink href="/api/export/scale-plu" variant="secondary" size="sm">
              <Download className="h-3.5 w-3.5" /> PLU за везната (CSV)
            </ButtonLink>
          }
        />
        <CardBody>
          <Form action={saveScaleFormats} className="space-y-3">
            <div className="grid grid-cols-[6rem_7rem_1fr] gap-2 text-xs font-medium text-muted">
              <span>Префикс</span>
              <span>Цифри PLU</span>
              <span>Стойност</span>
            </div>
            {[0, 1, 2, 3].map((i) => {
              const f = scaleFormats[i];
              return (
                <div key={i} className="grid grid-cols-[6rem_7rem_1fr] gap-2">
                  <Input name={`prefix_${i}`} defaultValue={f?.prefix ?? ""} placeholder={i === 0 ? "28" : ""} inputMode="numeric" maxLength={3} className="font-mono" disabled={!manage} aria-label={`Префикс ${i + 1}`} />
                  <Input name={`pluLength_${i}`} type="number" min={3} max={7} defaultValue={f?.pluLength ?? 5} disabled={!manage} aria-label={`Цифри PLU ${i + 1}`} />
                  <Select name={`kind_${i}`} defaultValue={f?.kind ?? "weight"} disabled={!manage} aria-label={`Вид ${i + 1}`}>
                    {SCALE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {SCALE_KIND_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                </div>
              );
            })}
            {manage && (
              <div className="flex flex-wrap justify-end gap-2">
                {scaleFormats.length === 0 && (
                  <SubmitButton variant="ghost" name="preset" value="1">
                    Стандартни (28 — тегло, 29 — цена)
                  </SubmitButton>
                )}
                <SubmitButton variant="secondary">Запази форматите</SubmitButton>
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

      {ctx.role === "owner" && (
        <Card className="lg:col-span-2">
          <CardHeader title="Данни и изтриване" description="Пълен експорт (всички таблици като CSV и снимките) и окончателно изтриване на организацията." />
          <CardBody className="flex flex-wrap items-start justify-between gap-6 text-sm">
            <div className="space-y-2">
              {/* файл за изтегляне от route handler — не страница, затова не <Link> */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/export/organization" className={buttonClasses("secondary", "sm")}>
                <Download className="h-4 w-4" /> Изтегли пълен експорт (ZIP)
              </a>
              <p className="max-w-sm text-muted">Без тайните (API ключове, webhooks). Работи и когато абонаментът е само за преглед.</p>
            </div>
            {ctx.org.deletionRequestedAt ? (
              <Form action={cancelOrganizationDeletion} className="max-w-sm space-y-2">
                <p className="font-medium text-danger">Заявено изтриване на {formatDate(ctx.org.deletionRequestedAt)} от {ctx.org.deletionRequestedBy}.</p>
                <p className="text-muted">Данните се изтриват окончателно на {formatDate(new Date(ctx.org.deletionRequestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000))}.</p>
                <SubmitButton variant="secondary" size="sm">
                  Откажи изтриването
                </SubmitButton>
              </Form>
            ) : (
              <Form action={requestOrganizationDeletion} className="max-w-sm space-y-2">
                <p className="text-muted">
                  След {DELETION_GRACE_DAYS} дни базата, снимките и членствата се изтриват окончателно. Въведете <code>{ctx.org.subdomain}</code>, за да потвърдите.
                </p>
                <Input name="confirm" required placeholder={ctx.org.subdomain} className="font-mono" />
                <ConfirmButton variant="danger" size="sm" message="Да заявя ли окончателно изтриване на организацията?">
                  <Trash2 className="h-4 w-4" /> Изтрий организацията
                </ConfirmButton>
              </Form>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
