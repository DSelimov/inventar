import type { Metadata } from "next";
import { Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { createLocation, deleteLocation, setDefaultLocation, updateLocation } from "@/lib/actions/locations";
import { requireContext } from "@/lib/auth";
import { listLocations } from "@/lib/queries";
import { Form } from "@/components/ui/form";

export const metadata: Metadata = { title: "Локации" };

export default async function LocationsPage() {
  const ctx = await requireContext("manage");
  const locations = await listLocations(ctx.db, true);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {locations.map((l) => (
          <Card key={l.id}>
            <CardBody>
              <Form action={updateLocation.bind(null, l.id)} className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr_auto]">
                <Field label="Име">
                  <Input name="name" defaultValue={l.name} required />
                </Field>
                <Field label="Код">
                  <Input name="code" defaultValue={l.code ?? ""} className="font-mono" />
                </Field>
                <Field label="Адрес">
                  <Input name="address" defaultValue={l.address ?? ""} />
                </Field>
                <div className="flex items-end gap-2">
                  <SubmitButton variant="secondary" size="md">
                    Запази
                  </SubmitButton>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
                  <Checkbox name="active" defaultChecked={l.active} label="Активна" />
                  {l.isDefault && <Badge tone="accent">По подразбиране</Badge>}
                </div>
              </Form>
              {!l.isDefault && (
                <div className="mt-2 flex justify-end gap-2">
                  <Form action={setDefaultLocation.bind(null, l.id)}>
                    <SubmitButton variant="ghost" size="sm">
                      <Star className="h-3.5 w-3.5" /> Направи по подразбиране
                    </SubmitButton>
                  </Form>
                  <Form action={deleteLocation.bind(null, l.id)}>
                    <ConfirmButton variant="ghost" size="sm" message={`Да изтрия ли локация „${l.name}“? Разрешено е само ако няма наличност.`}>
                      <Trash2 className="h-3.5 w-3.5" /> Изтрий
                    </ConfirmButton>
                  </Form>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
      <Card className="h-fit">
        <CardHeader title="Нова локация" description="Склад, магазин, автомобил, рафт — всяко място, където има стока." />
        <CardBody>
          <Form action={createLocation} className="space-y-3">
            <Field label="Име">
              <Input name="name" required placeholder="напр. Магазин Център" />
            </Field>
            <Field label="Код">
              <Input name="code" placeholder="SHOP1" className="font-mono" />
            </Field>
            <Field label="Адрес">
              <Input name="address" />
            </Field>
            <SubmitButton className="w-full">
              <Plus className="h-4 w-4" /> Добави локация
            </SubmitButton>
          </Form>
        </CardBody>
      </Card>
    </div>
  );
}
