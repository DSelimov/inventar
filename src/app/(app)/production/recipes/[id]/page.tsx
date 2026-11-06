import { notFound } from "next/navigation";
import { Factory, Trash2 } from "lucide-react";
import { RecipeForm } from "@/components/production/recipe-form";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { deleteRecipe, updateRecipe } from "@/lib/actions/production";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRecipe, listItemOptions } from "@/lib/queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const r = await getRecipe(ctx.db, Number((await params).id));
  return { title: r?.name ?? "Рецепта" };
}

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("write");
  const id = Number((await params).id);
  const [recipe, items] = await Promise.all([getRecipe(ctx.db, id), listItemOptions(ctx.db)]);
  if (!recipe) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={recipe.name}
        back={{ href: "/production/recipes", label: "Рецепти" }}
        actions={
          <>
            {recipe.active && (
              <ButtonLink href={`/production/new?recipe=${id}`}>
                <Factory className="h-4 w-4" /> Произведи
              </ButtonLink>
            )}
            {can(ctx.role, "delete") && (
              <Form action={deleteRecipe.bind(null, id)}>
                <ConfirmButton variant="danger" message={`Да изтрия ли рецепта „${recipe.name}“? Ако има протоколи, само се деактивира.`}>
                  <Trash2 className="h-4 w-4" /> Изтрий
                </ConfirmButton>
              </Form>
            )}
          </>
        }
      />
      <RecipeForm items={items} recipe={{ ...recipe, lines: recipe.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })) }} action={updateRecipe.bind(null, id)} cancelHref="/production/recipes" />
    </div>
  );
}
