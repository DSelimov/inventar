import type { Metadata } from "next";
import { Database, FileUp, Rocket, Trash2 } from "lucide-react";
import { OnboardingChecklist } from "@/components/onboarding/checklist";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { loadDemo, quickStartItems, removeDemo } from "@/lib/actions/onboarding";
import { requireContext } from "@/lib/auth";
import { onboardingState } from "@/lib/onboarding";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Първи стъпки" };

const ROWS = 5;
const PLACEHOLDERS = ["напр. Безжична мишка", "напр. Копирна хартия А4", "", "", ""];

export default async function OnboardingPage() {
  const ctx = await requireContext();
  const state = await onboardingState(ctx.db, ctx.org.id);
  const manage = can(ctx.role, "manage");
  const writable = can(ctx.role, "write");

  return (
    <>
      <PageHeader title={`Добре дошли в ${ctx.org.name}`} description="Няколко стъпки, за да започнете. Всичко може да се промени по-късно." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {writable && (
            <Card>
              <CardHeader title="Бърз старт" description="Една категория и първите артикули с наличност в основната локация. Кодовете се генерират автоматично." />
              <CardBody>
                <Form action={quickStartItems} className="space-y-4">
                  <Field label="Категория (по избор)">
                    <Input name="category" placeholder="напр. Електроника" />
                  </Field>
                  <div className="space-y-2">
                    <div className="hidden grid-cols-[1fr_6rem_5rem_7rem] gap-2 text-xs font-medium text-muted sm:grid">
                      <span>Артикул</span>
                      <span>Наличност</span>
                      <span>М.е.</span>
                      <span>Продажна цена</span>
                    </div>
                    {Array.from({ length: ROWS }, (_, i) => (
                      <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_5rem_7rem]">
                        <Input name={`name_${i}`} placeholder={PLACEHOLDERS[i] || "Артикул"} required={i === 0} className="col-span-2 sm:col-span-1" aria-label={`Артикул ${i + 1}`} />
                        <Input name={`qty_${i}`} type="number" min={0} placeholder="0" aria-label="Наличност" />
                        <Input name={`unit_${i}`} defaultValue="бр." aria-label="Мерна единица" />
                        <Input name={`price_${i}`} type="number" min={0} step="0.01" placeholder="0,00" className="col-span-2 sm:col-span-1" aria-label="Продажна цена" />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <SubmitButton>
                      <Rocket className="h-4 w-4" />
                      Създай артикулите
                    </SubmitButton>
                  </div>
                </Form>
              </CardBody>
            </Card>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader title="Импорт от CSV / Excel" description="Имате списък в Excel? Запазете го като CSV и го качете — колоните се разпознават автоматично." />
              <CardBody>
                <ButtonLink href="/settings/import" variant="secondary" className="w-full">
                  <FileUp className="h-4 w-4" />
                  Към импорта
                </ButtonLink>
              </CardBody>
            </Card>
            {manage && (
              <Card>
                <CardHeader title="Демо данни" description={state.hasDemo ? "Заредени са примерни артикули, партньори и поръчка." : "Разгледайте системата с примерни артикули, партньори и поръчка."} />
                <CardBody>
                  {state.hasDemo ? (
                    <Form action={removeDemo}>
                      <ConfirmButton variant="danger" className="w-full" message="Да изтрия ли демо артикулите, партньорите и поръчката (с движенията им)? Вашите данни остават.">
                        <Trash2 className="h-4 w-4" />
                        Изтрий демо данните
                      </ConfirmButton>
                    </Form>
                  ) : state.empty ? (
                    <Form action={loadDemo}>
                      <SubmitButton variant="secondary" className="w-full">
                        <Database className="h-4 w-4" />
                        Зареди демо данни
                      </SubmitButton>
                    </Form>
                  ) : (
                    <p className="text-sm text-muted">Демо данни се зареждат само в организация без артикули.</p>
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        </div>

        <Card className="h-fit">
          <CardHeader title="Стъпки" description={`${state.done} от ${state.steps.length} готови`} />
          <CardBody>
            <OnboardingChecklist steps={state.steps} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
