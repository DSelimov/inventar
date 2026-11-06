import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listRecipes } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Рецепти" };

export default async function RecipesPage() {
  const ctx = await requireContext();
  const recipes = await listRecipes(ctx.db, true);
  const writable = can(ctx.role, "write");
  return (
    <>
      <PageHeader
        back={{ href: "/production", label: "Производство" }}
        title="Рецепти"
        description="От какво и колко се прави един артикул (торта, комплект, смес). Една рецепта служи и за разглобяване."
        actions={
          writable && (
            <ButtonLink href="/production/recipes/new">
              <Plus className="h-4 w-4" /> Нова рецепта
            </ButtonLink>
          )
        }
      />
      <Card>
        {recipes.length === 0 ? (
          <CardBody className="text-sm text-muted">Няма рецепти.</CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Рецепта</th>
                  <th>Произвежда</th>
                  <th>Съставки</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recipes.map((r) => (
                  <tr key={r.id} className={r.active ? "" : "text-muted"}>
                    <td>
                      <Link href={`/production/recipes/${r.id}`} className="font-medium hover:text-accent">
                        {r.name}
                      </Link>
                      {!r.active && (
                        <Badge tone="neutral" className="ml-2">
                          неактивна
                        </Badge>
                      )}
                    </td>
                    <td>
                      {formatNumber(r.outputQuantity)} {r.item.unit} {r.item.name}
                    </td>
                    <td className="text-xs text-muted">{r.lines.map((l) => `${formatNumber(l.quantity)} ${l.item.unit} ${l.item.name}`).join(" · ")}</td>
                    <td className="text-right">
                      {writable && r.active && (
                        <Link href={`/production/new?recipe=${r.id}`} className="text-xs font-medium text-accent hover:underline">
                          Произведи
                        </Link>
                      )}
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
