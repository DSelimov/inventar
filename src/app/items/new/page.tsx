import type { Metadata } from "next";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/ui/page-header";
import { createItem } from "@/lib/actions/items";
import { listCategoriesWithFields } from "@/lib/queries";

export const metadata: Metadata = { title: "Нов артикул" };

export default async function NewItemPage() {
  const categories = await listCategoriesWithFields();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Нов артикул" back={{ href: "/items", label: "Артикули" }} />
      <ItemForm categories={categories} action={createItem} cancelHref="/items" />
    </div>
  );
}
