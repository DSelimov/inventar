import type { Metadata } from "next";
import Link from "next/link";
import { Handshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { CONSIGNMENT_LABELS, consignmentStock, listConsignments } from "@/lib/consignment";
import { lineTotal, sumMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listPartners } from "@/lib/queries";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Консигнация" };

const TONE = { give: "info", report: "success", return: "warning" } as const;

export default async function ConsignmentsPage() {
  const ctx = await requireContext();
  const [stock, docs, partners] = await Promise.all([consignmentStock(ctx.db), listConsignments(ctx.db, undefined, 50), listPartners(ctx.db)]);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const byPartner = new Map<number, typeof stock>();
  for (const s of stock) byPartner.set(s.partnerId!, [...(byPartner.get(s.partnerId!) ?? []), s]);
  const name = (id: number) => partners.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <>
      <PageHeader
        title="Консигнация"
        description="Стока при клиенти на отговорно пазене: остава ваша, докато не отчетат продаденото. Отчетът създава продажба и вземане."
        actions={
          can(ctx.role, "write") && (
            <ButtonLink href="/consignments/new">
              <Handshake className="h-4 w-4" /> Нова операция
            </ButtonLink>
          )
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Стока при партньори" />
          {byPartner.size === 0 ? (
            <CardBody className="text-sm text-muted">Няма стока на консигнация.</CardBody>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Партньор</th>
                    <th className="text-right">Артикули</th>
                    {!ctx.hideCosts && <th className="text-right">Себестойност</th>}
                    <th className="text-right">По цена на дребно</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...byPartner.entries()].map(([pid, rows]) => (
                    <tr key={pid}>
                      <td>
                        <Link href={`/partners/${pid}`} className="font-medium hover:text-accent">
                          {name(pid)}
                        </Link>
                        <div className="text-xs text-muted">{rows.map((r) => `${formatNumber(r.quantity)} ${r.unit} ${r.name}`).join(" · ")}</div>
                      </td>
                      <td className="text-right tabular-nums">{rows.length}</td>
                      {!ctx.hideCosts && <td className="text-right tabular-nums">{money(sumMoney(rows.map((r) => lineTotal(r.quantity, r.unitCost))))}</td>}
                      <td className="text-right tabular-nums">{money(sumMoney(rows.map((r) => lineTotal(r.quantity, r.unitPrice))))}</td>
                      <td className="whitespace-nowrap text-right text-xs">
                        {can(ctx.role, "write") && (
                          <>
                            <Link href={`/consignments/new?partner=${pid}&kind=report`} className="font-medium text-accent hover:underline">
                              Отчет
                            </Link>
                            {" · "}
                            <Link href={`/consignments/new?partner=${pid}&kind=return`} className="font-medium text-accent hover:underline">
                              Връщане
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Документи" />
          {docs.length === 0 ? (
            <CardBody className="text-sm text-muted">Още няма документи.</CardBody>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>Вид</th>
                    <th>Партньор</th>
                    <th>Редове</th>
                    <th>Кога</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/consignments/${d.id}`} className="font-mono text-xs font-medium hover:text-accent">
                          {d.number}
                        </Link>
                      </td>
                      <td>
                        <Badge tone={TONE[d.kind]}>{CONSIGNMENT_LABELS[d.kind]}</Badge>
                      </td>
                      <td>{d.partner.name}</td>
                      <td className="text-xs text-muted">{d.lines.map((l) => `${formatNumber(l.quantity)} ${l.item.unit} ${l.item.name}`).join(" · ")}</td>
                      <td className="text-xs text-muted">{formatDateTime(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
