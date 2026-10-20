import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Truck } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/search-form";
import { Table, TableWrap } from "@/components/ui/table";
import { SHIPMENT_STATUSES, type ShipmentDirection, type ShipmentStatus } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { pageParam, param, type SearchParams } from "@/lib/paging";
import { pageShipments } from "@/lib/queries";
import { cn, formatDate, label, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Пратки" };

const TABS: Array<{ value: ShipmentStatus | "all"; label: string }> = [{ value: "all", label: "Всички" }, ...SHIPMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))];

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const status = (TABS.some((t) => t.value === param(sp, "status")) ? param(sp, "status") : "all") as ShipmentStatus | "all";
  const direction = (["inbound", "outbound"].includes(param(sp, "direction")) ? param(sp, "direction") : "all") as ShipmentDirection | "all";
  const q = param(sp, "q");
  const { rows, total, page, pageSize } = await pageShipments(ctx.db, { status, direction, q }, pageParam(sp));
  const tabHref = (value: string) => {
    const qs = new URLSearchParams();
    if (value !== "all") qs.set("status", value);
    if (direction !== "all") qs.set("direction", direction);
    if (q) qs.set("q", q);
    return `/shipments${qs.size ? `?${qs}` : ""}`;
  };
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
            href={tabHref(t.value)}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", status === t.value ? "bg-accent-soft text-accent" : "text-muted hover:text-text")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <FilterBar action="/shipments" resetHref={q || direction !== "all" ? tabHref(status).replace(/[?&](direction|q)=[^&]*/g, "") || "/shipments" : undefined}>
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <div className="min-w-56 flex-1">
          <Input name="q" placeholder="Референция, партньор, куриер, товарителница…" defaultValue={q} />
        </div>
        <Select name="direction" defaultValue={direction} className="w-auto">
          <option value="all">Входящи и изходящи</option>
          <option value="inbound">Входящи</option>
          <option value="outbound">Изходящи</option>
        </Select>
      </FilterBar>

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
      <Pagination basePath="/shipments" searchParams={sp} page={page} pageSize={pageSize} total={total} noun="пратки" />
    </>
  );
}
