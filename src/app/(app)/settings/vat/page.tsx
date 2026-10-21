import type { Metadata } from "next";
import { Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createVatRate, savePricesIncludeVat, setDefaultVatRate, updateVatRate } from "@/lib/actions/vat";
import { requireContext } from "@/lib/auth";
import { listVatRates } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "ДДС" };

export default async function VatPage() {
  const ctx = await requireContext("manage");
  const [rates, settings] = await Promise.all([listVatRates(ctx.db, false), getSettings(ctx.db)]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <p className="text-sm text-muted">
          Ставката на всеки ред в поръчка се запазва към момента на записа — промяна тук важи само за новите редове. Проверете основанията за 0 % спрямо ЗДДС.
        </p>
        {rates.map((r) => (
          <Card key={r.id}>
            <CardBody>
              <Form action={updateVatRate.bind(null, r.id)} className="grid gap-3 sm:grid-cols-[1fr_6rem_1fr_auto]">
                <Field label="Име">
                  <Input name="name" defaultValue={r.name} required />
                </Field>
                <Field label="Ставка, %">
                  <Input name="rate" type="number" min={0} max={100} step="0.01" defaultValue={r.rate} required />
                </Field>
                <Field label="Основание (при 0 %)">
                  <Input name="legalBasis" defaultValue={r.legalBasis ?? ""} placeholder="чл. … от ЗДДС" />
                </Field>
                <div className="flex items-end">
                  <SubmitButton variant="secondary" size="md">
                    Запази
                  </SubmitButton>
                </div>
                <input type="hidden" name="sortOrder" value={r.sortOrder} />
                <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
                  <Checkbox name="active" defaultChecked={r.active} label="Активна" />
                  {r.isDefault && <Badge tone="accent">По подразбиране</Badge>}
                </div>
              </Form>
              {!r.isDefault && r.active && (
                <Form action={setDefaultVatRate.bind(null, r.id)} className="mt-2 flex justify-end">
                  <SubmitButton variant="ghost" size="sm">
                    <Star className="h-3.5 w-3.5" /> Направи по подразбиране
                  </SubmitButton>
                </Form>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
      <div className="space-y-6">
        <Card className="h-fit">
          <CardHeader title="Цени в поръчките" description="Важи за новите поръчки; всяка поръчка помни своята настройка." />
          <CardBody>
            <Form action={savePricesIncludeVat} className="space-y-3">
              <Checkbox name="pricesIncludeVat" defaultChecked={settings.pricesIncludeVat} label="Цените се въвеждат с ДДС (за продажби на дребно)" />
              <SubmitButton variant="secondary" className="w-full">
                Запази
              </SubmitButton>
            </Form>
          </CardBody>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Нова ставка" />
          <CardBody>
            <Form action={createVatRate} className="space-y-3">
              <Field label="Име">
                <Input name="name" required placeholder="напр. 0 % — износ" />
              </Field>
              <Field label="Ставка, %">
                <Input name="rate" type="number" min={0} max={100} step="0.01" required />
              </Field>
              <Field label="Основание (при 0 %)">
                <Input name="legalBasis" placeholder="чл. … от ЗДДС" />
              </Field>
              <input type="hidden" name="sortOrder" value={rates.length + 1} />
              <SubmitButton className="w-full">
                <Plus className="h-4 w-4" /> Добави ставка
              </SubmitButton>
            </Form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
