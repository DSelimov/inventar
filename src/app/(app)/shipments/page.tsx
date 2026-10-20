import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Truck } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap } from "@/components/ui/table";
import { SHIPMENT_STATUSES, type ShipmentStatus } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listShipments } from "@/lib/queries";
import { cn, formatDate, label, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Пратки" };

const TABS: Array<{ value: ShipmentStatus | "all"; label: string }> = [{ value: "all", label: "Всички" }, ...SHIPMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))];

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const status = (TABS.some((t) => t.value === sp.status) ? sp.status : "all") as ShipmentStatus | "all";
  const rows = await listShipments(ctx.db, status);
  const today = todayIso();

  return (
    <>
      <PageHeader
        title="Пратки"
        description="Входящи доставки и изходящи пратки. Отбелязването като доставена обновява наличността автоматично."
        actions={
          can(ctx.role, "write") && (
            <ButtonLink href="/shipments/new">
              <Plus className="h-4 w-4" />
              Нова пратка
            </ButtonLink>
          )
        }
      />

      <div className="mb-4 flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "all" ? "/shipments" : `/shipments?status=${t.value}`}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", status === t.value ? "bg-accent-soft text-accent" : "text-muted hover:text-text")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <TableWrap>
        {rows.length === 0 ? (
          <EmptyState icon={Truck} title="Няма пратки" description="Създайте пратка или потвърдете поръчка и създайте пратка от нея." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Референция</th>
                <th>Посока</th>
                <th>Партньор</th>
                <th>Локация</th>
                <th>Статус</th>
                <th>Очаквана</th>
                <th className="text-right">Редове</th>
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
                      <div className="text-xs text-muted">
                        {s.order && (
                          <Link href={`/orders/${s.order.id}`} className="hover:text-accent">
                            Поръчка {s.order.number}
                          </Link>
                        )}
                        {s.trackingNumber && <span className="ml-2 font-mono">{s.trackingNumber}</span>}
                      </div>
                    </td>
                    <td>
                      <Badge tone={statusTone[s.direction]}>{label(s.direction)}</Badge>
                    </td>
                    <td className="text-muted">{s.partnerRecord?.name ?? s.partner ?? "—"}</td>
                    <td className="text-muted">{s.location?.name ?? "—"}</td>
                    <td>
                      <Badge tone={statusTone[s.status]}>{label(s.status)}</Badge>
                    </td>
                    <td className={overdue ? "font-medium text-danger" : "text-muted"}>
                      {formatDate(s.expectedDate)}
                      {overdue && " · закъснява"}
                    </td>
                    <td className="text-right tabular-nums">{s.lines.length}</td>
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
