import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Tags } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCategory } from "@/lib/actions/categories";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listCategories } from "@/lib/queries";

export const metadata: Metadata = { title: "Категории" };

export default async function CategoriesPage() {
  const ctx = await requireContext();
  const categories = await listCategories(ctx.db);
  const writable = can(ctx.role, "write");
  return (
    <>
      <PageHeader title="Категории" description="Групирайте артикулите и дефинирайте допълнителните полета, които всеки тип артикул изисква." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {categories.length === 0 ? (
            <Card>
              <EmptyState icon={Tags} title="Все още няма категории" description="Създайте категория като Електроника, Облекло или Резервни части и добавете полетата, които са важни за нея." />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {categories.map((c) => (
                <Link key={c.id} href={`/categories/${c.id}`} className="group rounded-2xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-accent/40">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                    <h2 className="font-semibold group-hover:text-accent">{c.name}</h2>
                  </div>
                  {c.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{c.description}</p>}
                  <div className="mt-4 flex gap-4 text-xs text-muted">
                    <span>
                      <strong className="font-semibold text-text">{c.itemCount}</strong> артикула
                    </span>
                    <span>
                      <strong className="font-semibold text-text">{c.fieldCount}</strong> полета
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        {writable && <Card className="h-fit">
          <CardHeader title="Нова категория" />
          <CardBody>
            <form action={createCategory} className="space-y-3">
              <Field label="Име">
                <Input name="name" required placeholder="напр. Електроника" />
              </Field>
              <Field label="Описание">
                <Textarea name="description" placeholder="По избор" className="min-h-16" />
              </Field>
              <Field label="Цвят">
                <Input name="color" type="color" defaultValue="#6366f1" className="h-10 w-20 p-1" />
              </Field>
              <SubmitButton className="w-full">
                <Plus className="h-4 w-4" />
                Създай категория
              </SubmitButton>
            </form>
          </CardBody>
        </Card>}
      </div>
    </>
  );
}
