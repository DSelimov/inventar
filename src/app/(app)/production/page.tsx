import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Factory } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listProductions } from "@/lib/queries";
import { formatDateTime, formatMoney, formatNumber, label } from "@/lib/utils";

export const metadata: Metadata = { title: "Производство" };

export default async function ProductionPage() {
  const ctx = await requireContext();
  const rows = await listProductions(ctx.db);
  return (
    <>
      <PageHeader
        help="production"
        title="Производство"
        description="Протоколи за производство по рецепта и за разглобяване. Вложеното се изписва по себестойност, произведеното влиза с нея."
        actions={
          <>
            <ButtonLink href="/production/recipes" variant="secondary">
              <BookOpen className="h-4 w-4" /> Рецепти
            </ButtonLink>
            {can(ctx.role, "write") && (
              <ButtonLink href="/production/new">
                <Factory className="h-4 w-4" /> Ново производство
              </ButtonLink>
            )}
          </>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <CardBody className="text-sm text-muted">
            Все още няма протоколи. Започнете с{" "}
            <Link href="/production/recipes/new" className="font-medium text-accent hover:underline">
              рецепта
            </Link>{" "}
            — от какво и колко се прави един артикул.
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Протокол</th>
                  <th>Вид</th>
                  <th>Артикул</th>
                  <th className="text-right">Количество</th>
                  <th className="text-right">Себестойност</th>
                  <th>Кога</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/production/${p.id}`} className="font-mono text-xs font-medium hover:text-accent">
                        {p.number}
                      </Link>
                    </td>
                    <td>
                      <Badge tone={statusTone[p.kind]}>{label(p.kind)}</Badge>
                    </td>
                    <td>
                      <Link href={`/items/${p.itemId}`} className="hover:text-accent">
                        {p.item.name}
                      </Link>
                      <div className="text-xs text-muted">{p.location?.name}</div>
                    </td>
                    <td className="text-right tabular-nums">
                      {formatNumber(p.quantity)} {p.item.unit}
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(p.totalCost, ctx.org.currency)}</td>
                    <td className="text-xs text-muted">
                      {formatDateTime(p.createdAt)}
                      {p.createdByName && <div>{p.createdByName}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
