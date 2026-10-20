import { notFound } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { addField, deleteCategory, deleteField, updateCategory } from "@/lib/actions/categories";
import { FIELD_TYPES } from "@/db/schema";
import { getCategory, listItems } from "@/lib/queries";
import { label, plural } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = await getCategory(Number((await params).id));
  return { title: c?.name ?? "Категория" };
}

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [category, items] = await Promise.all([getCategory(id), listItems({ categoryId: id, status: "all" })]);
  if (!category) notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/categories", label: "Категории" }}
        title={
          <span className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: category.color }} />
            {category.name}
          </span>
        }
        description={`${items.length} ${plural(items.length, "артикул", "артикула")} в тази категория`}
        actions={
          <>
            <ButtonLink href={`/items?category=${id}&status=all`} variant="secondary">
              Виж артикулите
            </ButtonLink>
            <form action={deleteCategory.bind(null, id)}>
              <ConfirmButton variant="danger" message={`Да изтрия ли „${category.name}“? Артикулите остават, но губят категорията и стойностите на персонализираните полета.`}>
                <Trash2 className="h-4 w-4" />
                Изтрий
              </ConfirmButton>
            </form>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Персонализирани полета" description="Допълнителни атрибути за всеки артикул в категорията (размер, цвят, срок на годност…)." />
            {category.fields.length === 0 ? (
              <CardBody className="text-sm text-muted">Все още няма полета. Добавете с формата вдясно.</CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Поле</th>
                    <th>Тип</th>
                    <th>Опции</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {category.fields.map((f) => (
                    <tr key={f.id}>
                      <td className="font-medium">
                        {f.name} {f.required && <Badge tone="warning">задължително</Badge>}
                      </td>
                      <td>
                        <Badge tone="neutral">{label(f.type)}</Badge>
                      </td>
                      <td className="text-muted">{f.options ? (JSON.parse(f.options) as string[]).join(", ") : "—"}</td>
                      <td className="text-right">
                        <form action={deleteField.bind(null, id, f.id)}>
                          <Button type="submit" variant="ghost" size="sm" aria-label="Изтрий полето">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Настройки на категорията" />
            <CardBody>
              <form action={updateCategory.bind(null, id)} className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <Field label="Име">
                  <Input name="name" required defaultValue={category.name} />
                </Field>
                <Field label="Цвят">
                  <Input name="color" type="color" defaultValue={category.color} className="h-10 w-20 p-1" />
                </Field>
                <Field label="Описание" className="sm:col-span-2">
                  <Textarea name="description" defaultValue={category.description ?? ""} className="min-h-16" />
                </Field>
                <div className="sm:col-span-2 flex justify-end">
                  <SubmitButton variant="secondary">Запази</SubmitButton>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Добави поле" />
          <CardBody>
            <form action={addField.bind(null, id)} className="space-y-3">
              <Field label="Име на полето">
                <Input name="name" required placeholder="напр. Размер" />
              </Field>
              <Field label="Тип">
                <Select name="type" defaultValue="text">
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Възможни стойности" hint="Само за тип „Избор“. Разделете със запетая.">
                <Input name="options" placeholder="S, M, L, XL" />
              </Field>
              <Field label="Подредба">
                <Input name="sortOrder" type="number" defaultValue={category.fields.length} />
              </Field>
              <Checkbox name="required" label="Задължително при запис на артикул" />
              <SubmitButton className="w-full">
                <Plus className="h-4 w-4" />
                Добави поле
              </SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
