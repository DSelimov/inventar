import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePlan } from "@/lib/actions/admin";
import { listPlans } from "@/lib/plans";
import { requirePlatformAdmin } from "@/lib/platform";

export const metadata: Metadata = { title: "Планове" };

export default async function PlansPage() {
  await requirePlatformAdmin();
  const plans = await listPlans(false);
  return (
    <>
      <PageHeader title="Планове" description="Цени и лимити на абонаментите. Празен лимит = без ограничение. Промяната важи веднага за всички организации на плана." />
      <div className="space-y-4">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardBody>
              <Form action={updatePlan.bind(null, p.id)} className="grid gap-3 sm:grid-cols-4">
                <Field label={`Име (код ${p.code})`}>
                  <Input name="name" defaultValue={p.name} required />
                </Field>
                <Field label={`Цена на месец, ${p.currency}`}>
                  <Input name="monthlyPrice" type="number" min={0} step="0.01" defaultValue={p.monthlyPrice} required />
                </Field>
                <Field label="Описание" className="sm:col-span-2">
                  <Input name="description" defaultValue={p.description ?? ""} />
                </Field>
                <Field label="Потребители">
                  <Input name="maxUsers" type="number" min={0} defaultValue={p.maxUsers ?? ""} placeholder="без лимит" />
                </Field>
                <Field label="Артикули">
                  <Input name="maxItems" type="number" min={0} defaultValue={p.maxItems ?? ""} placeholder="без лимит" />
                </Field>
                <Field label="Локации">
                  <Input name="maxLocations" type="number" min={0} defaultValue={p.maxLocations ?? ""} placeholder="без лимит" />
                </Field>
                <Field label="Фактури на месец">
                  <Input name="maxInvoicesPerMonth" type="number" min={0} defaultValue={p.maxInvoicesPerMonth ?? ""} placeholder="без лимит" />
                </Field>
                <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
                  <Checkbox name="apiAccess" defaultChecked={p.apiAccess} label="API и webhooks" />
                  <Checkbox name="integrations" defaultChecked={p.integrations} label="Интеграции" />
                  <Checkbox name="active" defaultChecked={p.active} label="Предлага се" />
                </div>
                <div className="flex justify-end">
                  <SubmitButton variant="secondary">Запази</SubmitButton>
                </div>
              </Form>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
