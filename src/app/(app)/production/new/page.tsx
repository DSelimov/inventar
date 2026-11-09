import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Factory } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableWrap } from "@/components/ui/table";
import { runProductionAction } from "@/lib/actions/production";
import { requireContext } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { lineTotal, sumMoney } from "@/lib/money";
import { param, type SearchParams } from "@/lib/paging";
import { planProduction } from "@/lib/production";
import { parseQuantity } from "@/lib/quantity";
import { listLocationsFor, listRecipes } from "@/lib/queries";
import { cn, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Ново производство" };

export default async function NewProductionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  const [recipes, locations] = await Promise.all([listRecipes(ctx.db), listLocationsFor(ctx)]);
  const recipeId = Number(param(sp, "recipe")) || recipes[0]?.id;
  const kind = param(sp, "kind") === "disassembly" ? "disassembly" : "assembly";
  const locationId = Number(param(sp, "location")) || locations.find((l) => l.isDefault)?.id || locations[0]?.id;
  const quantityRaw = param(sp, "quantity");
  const money = (v: number) => formatMoney(v, ctx.org.currency);

  let plan: Awaited<ReturnType<typeof planProduction>> | null = null;
  let error: string | null = null;
  let quantity = 0;
  if (recipeId && locationId && quantityRaw) {
    try {
      quantity = parseQuantity(quantityRaw, 3, "Количество");
      plan = await planProduction(ctx.db, { recipeId, quantity, locationId, kind });
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      error = e.message;
    }
  }
  const recipe = recipes.find((r) => r.id === recipeId);
  // при производство липсват съставки; при разглобяване — самият артикул
  const consumed = plan ? (kind === "assembly" ? plan.lines.map((l) => ({ item: l.item, quantity: l.quantity, available: l.available })) : [{ item: plan.output, quantity, available: plan.outputAvailable }]) : [];
  const produced = plan ? (kind === "assembly" ? [{ item: plan.output, quantity }] : plan.lines.map((l) => ({ item: l.item, quantity: l.quantity }))) : [];
  const short = consumed.filter((c) => c.available < c.quantity);
  const estimate = sumMoney(consumed.map((c) => lineTotal(c.quantity, c.item.unitCost)));
  const hidden = { recipe: recipeId, kind, location: locationId, quantity: quantityRaw };

  if (recipes.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader help="production" title="Ново производство" back={{ href: "/production", label: "Производство" }} />
        <Card>
          <CardBody className="text-sm text-muted">
            Първо създайте{" "}
            <Link href="/production/recipes/new" className="font-medium text-accent hover:underline">
              рецепта
            </Link>
            .
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Ново производство" back={{ href: "/production", label: "Производство" }} description="Изберете рецепта и количество, прегледайте какво ще се вложи и приложете." />
      <Card>
        <CardBody>
          <form action="/production/new" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Рецепта" className="lg:col-span-2">
              <Select name="recipe" defaultValue={recipeId}>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} → {r.item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Вид">
              <Select name="kind" defaultValue={kind}>
                <option value="assembly">Производство</option>
                <option value="disassembly">Разглобяване</option>
              </Select>
            </Field>
            <Field label={`Количество (${recipe?.item.unit ?? "бр."})`}>
              <Input name="quantity" type="number" min={0} step="any" defaultValue={quantityRaw || String(recipe?.outputQuantity ?? 1)} required />
            </Field>
            <Field label="Склад">
              <Select name="location" defaultValue={locationId}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end lg:col-span-3">
              <SubmitButton variant="secondary">
                <Eye className="h-4 w-4" /> Преглед
              </SubmitButton>
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </CardBody>
      </Card>

      {plan && (
        <>
          <Card>
            <CardHeader title={kind === "assembly" ? "Ще се вложи" : "Ще се разглоби"} description={`Ориентировъчна себестойност ${money(estimate)} (по текущите доставни цени).`} />
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Артикул</th>
                    <th className="text-right">Нужно</th>
                    <th className="text-right">Налично</th>
                  </tr>
                </thead>
                <tbody>
                  {consumed.map((c) => (
                    <tr key={c.item.id}>
                      <td>
                        {c.item.name}
                        <div className="font-mono text-xs text-muted">{c.item.sku}</div>
                      </td>
                      <td className="text-right tabular-nums">
                        {formatNumber(c.quantity)} {c.item.unit}
                      </td>
                      <td className={cn("text-right tabular-nums", c.available < c.quantity ? "font-semibold text-danger" : "text-muted")}>
                        {formatNumber(c.available)} {c.item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
          <Card>
            <CardHeader title={kind === "assembly" ? "Ще се произведе" : "Ще се получи"} />
            <CardBody className="space-y-1 text-sm">
              {produced.map((p) => (
                <div key={p.item.id} className="flex justify-between">
                  <span>{p.item.name}</span>
                  <span className="tabular-nums">
                    {formatNumber(p.quantity)} {p.item.unit}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>
          {short.length > 0 ? (
            <p className="text-sm text-danger">Недостатъчна наличност: {short.map((s) => s.item.name).join(", ")}. Заприходете или изберете друг склад.</p>
          ) : (
            <Form action={runProductionAction} className="space-y-3">
              {Object.entries(hidden).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={String(v ?? "")} />
              ))}
              <Field label="Бележка">
                <Textarea name="notes" className="min-h-16" />
              </Field>
              <div className="flex justify-end">
                <SubmitButton>
                  <Factory className="h-4 w-4" /> {kind === "assembly" ? "Произведи" : "Разглоби"}
                </SubmitButton>
              </div>
            </Form>
          )}
        </>
      )}
    </div>
  );
}
