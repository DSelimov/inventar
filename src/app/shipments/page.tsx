import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Truck } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap } from "@/components/ui/table";
import { SHIPMENT_STATUSES, type ShipmentStatus } from "@/db/schema";
import { listShipments } from "@/lib/queries";
import { cn, formatDate, label, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Пратки" };

const TABS: Array<{ value: ShipmentStatus | "all"; label: string }> = [
  { value: "all", label: "Всички" },
  ...SHIPMENT_STATUSES.map((s) => ({ value: s, label: label(s) })),
];

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = (TABS.some((t) => t.value === sp.status) ? sp.status : "all") as ShipmentStatus | "all";
  const rows = await listShipments(status);
  const today = todayIso();

  return (
    <>
      <PageHeader
        title="Пратки"
        description="Входящи доставки и изходящи поръчки. Отбелязването на пратка като доставена обновява наличността автоматично."
        actions={
          <ButtonLink href="/shipments/new">
            <Plus className="h-4 w-4" />
            Нова пратка
          </ButtonLink>
        }
      />

      <div className="mb-4 flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "all" ? "/shipments" : `/shipments?status=${t.value}`}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              status === t.value ? "bg-accent-soft text-accent" : "text-muted hover:text-text",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <TableWrap>
        {rows.length === 0 ? (
          <EmptyState icon={Truck} title="Няма пратки" description="Създайте пратка, за да следите входяща или изходяща стока." action={<ButtonLink href="/shipments/new">Нова пратка</ButtonLink>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Референция</th>
                <th>Посока</th>
                <th>Партньор</th>
                <th>Статус</th>
                <th>Очаквана</th>
                <th className="text-right">Редове</th>
                <th>Куриер</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const overdue = s.expectedDate && s.expectedDate < today && (s.status === "pending" || s.status === "in_transit");
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/shipments/${s.id}`} className="font-medium hover:text-accent">
                        {s.reference}
                      </Link>
                      {s.trackingNumber && <div className="font-mono text-xs text-muted">{s.trackingNumber}</div>}
                    </td>
                    <td>
                      <Badge tone={statusTone[s.direction]}>{label(s.direction)}</Badge>
                    </td>
                    <td className="text-muted">{s.partner ?? "—"}</td>
                    <td>
                      <Badge tone={statusTone[s.status]}>{label(s.status)}</Badge>
                    </td>
                    <td className={overdue ? "font-medium text-danger" : "text-muted"}>
                      {formatDate(s.expectedDate)}
                      {overdue && " · закъснява"}
                    </td>
                    <td className="text-right tabular-nums">{s.lines.length}</td>
                    <td className="text-muted">{s.carrier ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableWrap>
    </>
  );
}
