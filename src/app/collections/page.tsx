import Link from "next/link";
import type { Metadata } from "next";
import { Layers, Plus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCollection } from "@/lib/actions/collections";
import { listCollections } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Колекции" };

export default async function CollectionsPage() {
  const collections = await listCollections();
  return (
    <>
      <PageHeader title="Колекции" description="Свободни групи от артикули: комплект, витрина, сезон, клиентски проект." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {collections.length === 0 ? (
            <Card>
              <EmptyState icon={Layers} title="Все още няма колекции" description="Колекциите ви позволяват да следите набор от артикули заедно, независимо от категорията им." />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {collections.map((c) => (
                <Link key={c.id} href={`/collections/${c.id}`} className="group rounded-2xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-accent/40">
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
                      <strong className="font-semibold text-text">{formatNumber(c.totalQuantity)}</strong> единици
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader title="Нова колекция" />
          <CardBody>
            <form action={createCollection} className="space-y-3">
              <Field label="Име">
                <Input name="name" required placeholder="напр. Лято 2026" />
              </Field>
              <Field label="Описание">
                <Textarea name="description" placeholder="По избор" className="min-h-16" />
              </Field>
              <Field label="Цвят">
                <Input name="color" type="color" defaultValue="#0ea5e9" className="h-10 w-20 p-1" />
              </Field>
              <SubmitButton className="w-full">
                <Plus className="h-4 w-4" />
                Създай колекция
              </SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
