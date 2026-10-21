import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardCheck, Play } from "lucide-react";
import { CountStatusBadge } from "@/components/counts/count-status";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { startStockCount } from "@/lib/actions/counts";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listCategories, listLocations, listStockCounts } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Инвентаризация" };

export default async function CountsPage() {
  const ctx = await requireContext();
  const [counts, locations, categories] = await Promise.all([listStockCounts(ctx.db), listLocations(ctx.db), listCategories(ctx.db)]);
  const writable = can(ctx.role, "write");

  return (
    <>
      <PageHeader title="Инвентаризация" description="Преброяване на склада: списък с очакваните количества, броене със скенер, разлики и корекция с един бутон." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Броения" />
          {counts.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Все още няма инвентаризации" description="Започнете първата от формата вдясно." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Локация</th>
                  <th>Статус</th>
                  <th className="text-right">Преброени</th>
                  <th className="text-right">Разлики</th>
                  <th>Започната</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.count.id}>
                    <td>
                      <Link href={`/counts/${c.count.id}`} className="font-medium hover:text-accent">
                        {c.count.number}
                      </Link>
                      {c.category && <div className="text-xs text-muted">{c.category}</div>}
                    </td>
                    <td>{c.location}</td>
                    <td>
                      <CountStatusBadge status={c.count.status} />
                    </td>
                    <td className="text-right tabular-nums">
                      {c.counted} / {c.lines}
                    </td>
                    <td className={`text-right tabular-nums ${c.differences ? "font-medium text-warning" : "text-muted"}`}>{c.differences}</td>
                    <td className="whitespace-nowrap text-muted">
                      {formatDate(c.count.createdAt)}
                      {c.count.createdBy && <div className="text-xs">{c.count.createdBy}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {writable && (
          <Card>
            <CardHeader title="Нова инвентаризация" description="Очакваните количества се записват в момента на започване." />
            <CardBody>
              <Form action={startStockCount} className="space-y-3">
                <Field label="Локация">
                  <Select name="locationId" required defaultValue={locations.find((l) => l.isDefault)?.id ?? ""}>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Категория" hint="По избор — за частично броене.">
                  <Select name="categoryId" defaultValue="">
                    <option value="">Всички</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Checkbox name="includeZero" label="Включи и артикулите с нулева наличност" />
                <Field label="Бележка">
                  <Input name="notes" placeholder="напр. годишна инвентаризация" />
                </Field>
                <SubmitButton className="w-full">
                  <Play className="h-4 w-4" />
                  Започни
                </SubmitButton>
              </Form>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
