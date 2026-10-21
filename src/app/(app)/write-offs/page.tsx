import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Trash } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { sumMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listWriteOffs } from "@/lib/queries";
import { formatDate, formatMoney, label } from "@/lib/utils";

export const metadata: Metadata = { title: "Брак" };

export default async function WriteOffsPage() {
  const ctx = await requireContext();
  const rows = await listWriteOffs(ctx.db);
  return (
    <>
      <PageHeader help="write-offs"
        title="Брак"
        description="Протоколи за брак: стока с изтекъл срок, повредена или липсваща — изписва се по себестойност, с комисия и подписи."
        actions={
          can(ctx.role, "write") && (
            <ButtonLink href="/write-offs/new">
              <Plus className="h-4 w-4" /> Нов протокол
            </ButtonLink>
          )
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Trash} title="Няма протоколи за брак" description="Създайте първия с „Нов протокол“." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Локация</th>
                <th>Причина</th>
                <th>Статус</th>
                <th className="text-right">Редове</th>
                <th className="text-right">Стойност</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link href={`/write-offs/${w.id}`} className="font-medium hover:text-accent">
                      {w.number}
                    </Link>
                  </td>
                  <td>{w.location?.name ?? "—"}</td>
                  <td className="max-w-64 truncate text-muted">{w.reason}</td>
                  <td>
                    <Badge tone={statusTone[w.status] ?? "neutral"}>{label(w.status)}</Badge>
                  </td>
                  <td className="text-right tabular-nums">{w.lines.length}</td>
                  <td className="text-right tabular-nums">{w.status === "applied" ? formatMoney(sumMoney(w.lines.map((l) => l.value ?? 0)), ctx.org.currency) : "—"}</td>
                  <td className="text-muted">{formatDate(w.appliedAt ?? w.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
