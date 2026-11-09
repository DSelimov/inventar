import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createPriceGroup, deletePriceGroup, updatePriceGroup } from "@/lib/actions/pricing";
import { requireContext } from "@/lib/auth";
import { listPriceGroups, priceGroupUsage } from "@/lib/queries";

export const metadata: Metadata = { title: "Ценови групи" };

export default async function PriceGroupsPage() {
  const ctx = await requireContext("manage");
  const [groups, usage] = await Promise.all([listPriceGroups(ctx.db, true), priceGroupUsage(ctx.db)]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardBody className="text-sm text-muted">
            Цената <strong className="text-text">на дребно</strong> е продажната цена на артикула. Ценовите групи (Едро, Дилър, VIP…) имат собствени
            цени по артикул; клиент с група получава нейната цена, после групата на склада, иначе цената на дребно. Отстъпката на клиента
            (в картата му) се прилага върху тази цена. Масова промяна:{" "}
            <Link href="/items/prices" className="font-medium text-accent hover:underline">
              Артикули › Смяна на цени
            </Link>
            .
          </CardBody>
        </Card>
        {groups.length === 0 && (
          <Card>
            <CardBody className="text-sm text-muted">Все още няма ценови групи. Всички продажби са по цената на дребно.</CardBody>
          </Card>
        )}
        {groups.map((g) => (
          <Card key={g.id}>
            <CardBody>
              <Form action={updatePriceGroup.bind(null, g.id)} className="grid gap-3 sm:grid-cols-[1fr_7rem_auto]">
                <Field label="Име">
                  <Input name="name" defaultValue={g.name} required />
                </Field>
                <Field label="Подредба">
                  <Input name="sortOrder" type="number" defaultValue={g.sortOrder} />
                </Field>
                <div className="flex items-end">
                  <SubmitButton variant="secondary">Запази</SubmitButton>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
                  <Checkbox name="active" defaultChecked={g.active} label="Активна" />
                  <Badge tone="neutral">{usage.items.get(g.id) ?? 0} артикула с цена</Badge>
                  <Badge tone="neutral">{usage.partners.get(g.id) ?? 0} партньора</Badge>
                  {(usage.locations.get(g.id) ?? 0) > 0 && <Badge tone="neutral">{usage.locations.get(g.id)} локации</Badge>}
                  <Link href={`/items/prices?target=${g.id}&base=retail`} className="text-xs font-medium text-accent hover:underline">
                    Попълни цените
                  </Link>
                </div>
              </Form>
              <div className="mt-2 flex justify-end">
                <Form action={deletePriceGroup.bind(null, g.id)}>
                  <ConfirmButton variant="ghost" size="sm" message={`Да изтрия ли група „${g.name}“? Цените в нея се изтриват, а клиентите ѝ минават на цена на дребно.`}>
                    <Trash2 className="h-3.5 w-3.5" /> Изтрий
                  </ConfirmButton>
                </Form>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card className="h-fit">
        <CardHeader title="Нова ценова група" description="Напр. Едро, Дилъри, Ключови клиенти." />
        <CardBody>
          <Form action={createPriceGroup} className="space-y-3">
            <Field label="Име">
              <Input name="name" required placeholder="Едро" />
            </Field>
            <Field label="Подредба" hint="По-малкото число е по-напред в списъците.">
              <Input name="sortOrder" type="number" defaultValue={groups.length + 1} />
            </Field>
            <SubmitButton className="w-full">
              <Plus className="h-4 w-4" /> Добави група
            </SubmitButton>
          </Form>
        </CardBody>
      </Card>
    </div>
  );
}
