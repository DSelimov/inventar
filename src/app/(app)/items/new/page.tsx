import type { Metadata } from "next";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/ui/page-header";
import { createItem } from "@/lib/actions/items";
import { requireContext } from "@/lib/auth";
import { listCategoriesWithFields, listLocations } from "@/lib/queries";

export const metadata: Metadata = { title: "Нов артикул" };

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ barcode?: string }> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  const [categories, locations] = await Promise.all([listCategoriesWithFields(ctx.db), listLocations(ctx.db)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Нов артикул" back={{ href: "/items", label: "Артикули" }} />
      <ItemForm categories={categories} locations={locations} action={createItem} cancelHref="/items" defaultBarcode={sp.barcode} />
    </div>
  );
}
