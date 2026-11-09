import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { CONSIGNMENT_LABELS, getConsignment } from "@/lib/consignment";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const c = await getConsignment(ctx.db, Number((await params).id));
  return { title: c?.number ?? "Консигнация" };
}

export default async function ConsignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const c = await getConsignment(ctx.db, Number((await params).id));
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        back={{ href: "/consignments", label: "Консигнация" }}
        eyebrow={c.number}
        title={`${CONSIGNMENT_LABELS[c.kind]} — ${c.partner.name}`}
        description={
          <>
            {formatDateTime(c.createdAt)}
            {c.createdByName ? ` · ${c.createdByName}` : ""}
            {c.warehouse ? ` · склад ${c.warehouse.name}` : ""}
            {c.order && (
              <>
                {" · продажба "}
                <Link href={`/orders/${c.order.id}`} className="font-medium text-accent hover:underline">
                  {c.order.number}
                </Link>
              </>
            )}
          </>
        }
      />
      <Card>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Артикул</th>
                <th className="text-right">Количество</th>
                {c.kind === "report" && <th className="text-right">Цена</th>}
              </tr>
            </thead>
            <tbody>
              {c.lines.map((l) => (
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
                  {c.kind === "report" && <td className="text-right tabular-nums">{l.unitPrice === null ? "—" : formatMoney(l.unitPrice, ctx.org.currency)}</td>}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
      {c.notes && <p className="whitespace-pre-line text-sm text-muted">{c.notes}</p>}
    </div>
  );
}
