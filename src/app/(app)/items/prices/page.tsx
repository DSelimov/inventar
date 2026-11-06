import type { Metadata } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableWrap } from "@/components/ui/table";
import { bulkChangePrices } from "@/lib/actions/pricing";
import { requireContext } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { param, type SearchParams } from "@/lib/paging";
import { previewBulkPrices, readBulkParams, type BulkPriceParams } from "@/lib/price-groups";
import { PRICE_ROUNDINGS, ROUNDING_LABELS } from "@/lib/pricing";
import { listCategories, listPriceGroups } from "@/lib/queries";
import { cn, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Смяна на цени" };

const PREVIEW_ROWS = 200;

export default async function BulkPricesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext("manage");
  const sp = await searchParams;
  const [groups, categories] = await Promise.all([listPriceGroups(ctx.db), listCategories(ctx.db)]);
  const get = (k: string) => param(sp, k) || undefined;

  let params: BulkPriceParams | null = null;
  let error: string | null = null;
  try {
    params = readBulkParams(get);
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    error = e.message;
  }
  const preview = params && get("preview") ? await previewBulkPrices(ctx.db, params) : null;
  const changed = preview?.filter((r) => r.oldPrice !== r.newPrice) ?? [];
  const money = (v: number | null) => (v === null ? "—" : formatMoney(v, ctx.org.currency));
  const groupName = (v: "retail" | number) => (v === "retail" ? "на дребно" : (groups.find((g) => g.id === v)?.name ?? "група"));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Смяна на цени" back={{ href: "/items", label: "Артикули" }} description="Нова цена за много артикули наведнъж: от доставната, от цена на дребно или от друга група, с процент и закръгляне." />

      <Card className="mb-6">
        <CardBody>
          {/* GET: прегледът е в адреса, без запис; прилагането е отделна форма по-долу */}
          <form action="/items/prices" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="preview" value="1" />
            <Field label="Коя цена се сменя">
              <Select name="target" defaultValue={get("target") ?? "retail"}>
                <option value="retail">Цена на дребно</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    Група „{g.name}“
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Изчислена от">
              <Select name="base" defaultValue={get("base") ?? "current"}>
                <option value="current">Текущата цена (± %)</option>
                <option value="cost">Доставната цена (надценка)</option>
                <option value="retail">Цената на дребно</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    Цената в „{g.name}“
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Промяна (%)" hint="+20 = надценка 20 %, −5 = отстъпка 5 %.">
              <Input name="percent" type="number" step="0.01" min={-100} max={1000} defaultValue={get("percent") ?? "0"} />
            </Field>
            <Field label="Закръгляне">
              <Select name="rounding" defaultValue={get("rounding") ?? "0.01"}>
                {PRICE_ROUNDINGS.map((r) => (
                  <option key={r} value={r}>
                    {ROUNDING_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Категория">
              <Select name="category" defaultValue={get("category") ?? ""}>
                <option value="">Всички активни артикули</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col justify-end gap-3">
              {groups.length > 0 && <Checkbox name="onlyMissing" value="1" defaultChecked={get("onlyMissing") === "1"} label="Само артикули без цена в групата" />}
              <SubmitButton variant="secondary">
                <Eye className="h-4 w-4" /> Преглед
              </SubmitButton>
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          {groups.length === 0 && (
            <p className="mt-3 text-xs text-muted">
              Цени за едро и други групи —{" "}
              <Link href="/settings/prices" className="font-medium text-accent hover:underline">
                Настройки › Ценови групи
              </Link>
              .
            </p>
          )}
        </CardBody>
      </Card>

      {preview && params && (
        <Card>
          <CardHeader
            title={`${changed.length} от ${preview.length} цени ще се променят`}
            description={`Цена ${groupName(params.target)}${params.percent ? `, ${params.percent > 0 ? "+" : ""}${params.percent} %` : ""}, ${ROUNDING_LABELS[params.rounding]}.`}
            actions={
              changed.length > 0 && (
                <Form action={bulkChangePrices}>
                  {(["target", "base", "percent", "rounding", "category", "onlyMissing"] as const).map((k) => (get(k) ? <input key={k} type="hidden" name={k} value={get(k)} /> : null))}
                  <SubmitButton>Приложи {changed.length} цени</SubmitButton>
                </Form>
              )
            }
          />
          {preview.length === 0 ? (
            <CardBody className="text-sm text-muted">Няма артикули по този филтър.</CardBody>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Артикул</th>
                    <th className="text-right">База</th>
                    <th className="text-right">Сега</th>
                    <th className="text-right">Нова</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, PREVIEW_ROWS).map((r) => (
                    <tr key={r.itemId} className={cn(r.oldPrice === r.newPrice && "text-muted")}>
                      <td>
                        <Link href={`/items/${r.itemId}`} className="font-medium hover:text-accent">
                          {r.name}
                          {r.variantLabel && <span className="text-muted"> · {r.variantLabel}</span>}
                        </Link>
                        <div className="font-mono text-xs text-muted">{r.sku}</div>
                      </td>
                      <td className="text-right tabular-nums">{money(r.base)}</td>
                      <td className="text-right tabular-nums">{money(r.oldPrice)}</td>
                      <td className={cn("text-right font-semibold tabular-nums", r.oldPrice !== null && r.newPrice > r.oldPrice && "text-success", r.oldPrice !== null && r.newPrice < r.oldPrice && "text-danger")}>{money(r.newPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
          {preview.length > PREVIEW_ROWS && <CardBody className="text-xs text-muted">Показани са първите {PREVIEW_ROWS}; прилагането променя всички {changed.length}.</CardBody>}
        </Card>
      )}
    </div>
  );
}
