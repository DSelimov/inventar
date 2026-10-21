import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { ColorBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { addItemToCollection, deleteCollection, removeItemFromCollection, updateCollection } from "@/lib/actions/collections";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCollection, listItemOptions } from "@/lib/queries";
import { formatMoney, formatNumber } from "@/lib/utils";
import { Form } from "@/components/ui/form";
import { lineTotal, sumLines } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const c = await getCollection(ctx.db, Number((await params).id));
  return { title: c?.name ?? "Колекция" };
}

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const ctx = await requireContext();
  const writable = can(ctx.role, "write");
  const settings = { currency: ctx.org.currency };
  const [collection, options] = await Promise.all([getCollection(ctx.db, id), listItemOptions(ctx.db)]);
  if (!collection) notFound();

  const members = collection.collectionItems.map((ci) => ci.item);
  const memberIds = new Set(members.map((m) => m.id));
  const available = options.filter((o) => !memberIds.has(o.id));
  const totalUnits = members.reduce((s, m) => s + m.quantity, 0);
  const totalValue = sumLines(members, (m) => m.quantity, (m) => m.unitCost);

  return (
    <>
      <PageHeader
        back={{ href: "/collections", label: "Колекции" }}
        title={
          <span className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: collection.color }} />
            {collection.name}
          </span>
        }
        description={collection.description ?? undefined}
        actions={
          can(ctx.role, "delete") && <Form action={deleteCollection.bind(null, id)}>
            <ConfirmButton variant="danger" message={`Да изтрия ли колекцията „${collection.name}“? Артикулите не се изтриват.`}>
              <Trash2 className="h-4 w-4" />
              Изтрий
            </ConfirmButton>
          </Form>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Артикули" value={String(members.length)} />
        <Stat label="Единици" value={formatNumber(totalUnits)} />
        <Stat label="Стойност на склад" value={formatMoney(totalValue, settings.currency)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Артикули в колекцията" />
          {members.length === 0 ? (
            <CardBody className="text-sm text-muted">Празна е. Добавете артикули с формата вдясно.</CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th>Категория</th>
                  <th className="text-right">Наличност</th>
                  <th className="text-right">Стойност</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/items/${m.id}`} className="font-medium hover:text-accent">
                        {m.name}
                      </Link>
                      <div className="font-mono text-xs text-muted">{m.sku}</div>
                    </td>
                    <td>{m.category ? <ColorBadge color={m.category.color}>{m.category.name}</ColorBadge> : "—"}</td>
                    <td className="text-right tabular-nums">
                      {formatNumber(m.quantity)} {m.unit}
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(lineTotal(m.quantity, m.unitCost), settings.currency)}</td>
                    <td className="text-right">
                      {writable && <Form action={removeItemFromCollection.bind(null, id, m.id)}>
                        <Button type="submit" variant="ghost" size="sm" aria-label="Премахни от колекцията">
                          <X className="h-4 w-4" />
                        </Button>
                      </Form>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {writable && <div className="space-y-6">
          <Card>
            <CardHeader title="Добави артикул" />
            <CardBody>
              <Form action={addItemToCollection.bind(null, id)} className="space-y-3">
                <Select name="itemId" required defaultValue="">
                  <option value="" disabled>
                    Изберете артикул…
                  </option>
                  {available.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.sku})
                    </option>
                  ))}
                </Select>
                <SubmitButton className="w-full" disabled={available.length === 0}>
                  <Plus className="h-4 w-4" />
                  Добави в колекцията
                </SubmitButton>
              </Form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Настройки на колекцията" />
            <CardBody>
              <Form action={updateCollection.bind(null, id)} className="space-y-3">
                <Field label="Име">
                  <Input name="name" required defaultValue={collection.name} />
                </Field>
                <Field label="Описание">
                  <Textarea name="description" defaultValue={collection.description ?? ""} className="min-h-16" />
                </Field>
                <Field label="Цвят">
                  <Input name="color" type="color" defaultValue={collection.color} className="h-10 w-20 p-1" />
                </Field>
                <SubmitButton variant="secondary" className="w-full">
                  Запази
                </SubmitButton>
              </Form>
            </CardBody>
          </Card>
        </div>}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
