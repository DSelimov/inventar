import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/ui/page-header";
import { updateItem } from "@/lib/actions/items";
import { requireContext } from "@/lib/auth";
import { getItem, listCategoriesWithFields, listLocations } from "@/lib/queries";

export const metadata: Metadata = { title: "Редакция на артикул" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("write");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [item, categories, locations] = await Promise.all([getItem(ctx.org.id, id), listCategoriesWithFields(ctx.org.id), listLocations(ctx.org.id)]);
  if (!item) notFound();
  const values = Object.fromEntries(item.fieldValues.map((v) => [v.fieldId, v.value]));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Редакция: ${item.name}`} back={{ href: `/items/${id}`, label: item.name }} />
      <ItemForm categories={categories} locations={locations} item={item} values={values} action={updateItem.bind(null, id)} cancelHref={`/items/${id}`} />
    </div>
  );
}
