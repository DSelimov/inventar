import type { Metadata } from "next";
import { RecipeForm } from "@/components/production/recipe-form";
import { PageHeader } from "@/components/ui/page-header";
import { createRecipe } from "@/lib/actions/production";
import { requireContext } from "@/lib/auth";
import { listItemOptions } from "@/lib/queries";

export const metadata: Metadata = { title: "Нова рецепта" };

export default async function NewRecipePage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const ctx = await requireContext("write");
  const items = await listItemOptions(ctx.db);
  const itemId = Number((await searchParams).item) || undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Нова рецепта" back={{ href: "/production/recipes", label: "Рецепти" }} />
      <RecipeForm items={items} initialItemId={itemId} action={createRecipe} cancelHref="/production/recipes" />
    </div>
  );
}
