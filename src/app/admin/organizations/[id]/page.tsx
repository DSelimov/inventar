import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { controlDb } from "@/db/control";
import { organizations, SUBSCRIPTION_STATUSES } from "@/db/control-schema";
import { setSubscription } from "@/lib/actions/admin";
import { listPlans, subscriptionState } from "@/lib/plans";
import { requirePlatformAdmin } from "@/lib/platform";
import { APP_DOMAIN } from "@/lib/tenant";

export const metadata: Metadata = { title: "Абонамент" };

const STATUS_TEXT = { trial: "Пробен период", active: "Активен", past_due: "Неплатен", cancelled: "Прекратен" } as const;
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function OrganizationSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const id = Number((await params).id);
  const [org] = Number.isInteger(id) ? await controlDb.select().from(organizations).where(eq(organizations.id, id)) : [];
  if (!org) notFound();
  const plans = await listPlans(false);
  const sub = subscriptionState(org);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={org.name} description={`${org.subdomain}.${APP_DOMAIN}`} back={{ href: "/admin", label: "Организации" }} />
      <Card>
        <CardHeader title="Абонамент" description={sub.message ?? sub.warning ?? "Пълен достъп."} />
        <CardBody>
          <Form action={setSubscription.bind(null, org.id)} className="grid gap-4 sm:grid-cols-2">
            <Field label="План">
              <Select name="planId" defaultValue={org.planId ?? ""}>
                <option value="">Без план (без лимити)</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Статус">
              <Select name="status" defaultValue={org.subscriptionStatus}>
                {SUBSCRIPTION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_TEXT[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Пробен период до" hint="Само за статус „Пробен период“.">
              <Input name="trialEndsAt" type="date" defaultValue={iso(org.trialEndsAt)} />
            </Field>
            <Field label="Платено до" hint="Активен: след тази дата има 7 дни гратисен период.">
              <Input name="paidUntil" type="date" defaultValue={iso(org.paidUntil)} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <SubmitButton>Запази</SubmitButton>
            </div>
          </Form>
        </CardBody>
      </Card>
    </div>
  );
}
