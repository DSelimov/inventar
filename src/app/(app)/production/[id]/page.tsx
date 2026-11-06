import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { getProduction } from "@/lib/queries";
import { formatDateTime, formatMoney, formatNumber, label } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const p = await getProduction(ctx.db, Number((await params).id));
  return { title: p ? `Протокол ${p.number}` : "Протокол" };
}

export default async function ProductionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const p = await getProduction(ctx.db, Number((await params).id));
  if (!p) notFound();
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const section = (direction: "in" | "out", title: string) => {
    const rows = p.lines.filter((l) => l.direction === direction);
    return (
      <Card>
        <CardHeader title={title} />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Артикул</th>
                <th className="text-right">Количество</th>
                <th className="text-right">Ед. себестойност</th>
                <th className="text-right">Стойност</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/items/${l.itemId}`} className="font-medium hover:text-accent">
                      {l.item.name}
                    </Link>
                    <div className="font-mono text-xs text-muted">{l.item.sku}</div>
                  </td>
                  <td className="text-right tabular-nums">
                    {formatNumber(l.quantity)} {l.item.unit}
                  </td>
                  <td className="text-right tabular-nums">{money(l.unitCost)}</td>
                  <td className="text-right font-medium tabular-nums">{money(l.value)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    );
  };
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        back={{ href: "/production", label: "Производство" }}
        eyebrow={p.number}
        title={`${label(p.kind)}: ${formatNumber(p.quantity)} ${p.item.unit} ${p.item.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[p.kind]}>{label(p.kind)}</Badge>
            <span>
              {p.location?.name} · {formatDateTime(p.createdAt)}
              {p.createdByName ? ` · ${p.createdByName}` : ""} · себестойност {money(p.totalCost)}
              {p.recipe ? ` · рецепта „${p.recipe.name}“` : ""}
            </span>
          </span>
        }
      />
      {section("out", p.kind === "assembly" ? "Вложено" : "Разглобено")}
      {section("in", p.kind === "assembly" ? "Произведено" : "Получени части")}
      {p.notes && <p className="whitespace-pre-line text-sm text-muted">{p.notes}</p>}
    </div>
  );
}
