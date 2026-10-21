import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList, Plus } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/search-form";
import { Table, TableWrap } from "@/components/ui/table";
import { ORDER_STATUSES, type OrderStatus, type OrderType } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { pageParam, param, type SearchParams } from "@/lib/paging";
import { pageOrders } from "@/lib/queries";
import { cn, formatDate, formatMoney, label } from "@/lib/utils";
import { sumLines } from "@/lib/money";

export const metadata: Metadata = { title: "Поръчки" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const q = param(sp, "q");
  const type = (["purchase", "sales"].includes(param(sp, "type")) ? param(sp, "type") : "all") as OrderType | "all";
  const status = ((ORDER_STATUSES as readonly string[]).includes(param(sp, "status")) ? param(sp, "status") : "all") as OrderStatus | "all";
  const { rows, total, page, pageSize } = await pageOrders(ctx.db, { type, status, q }, pageParam(sp));
  const href = (t: string, s: string) => `/orders?type=${t}&status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader
        title="Поръчки"
        description="Какво е договорено с доставчици и клиенти. Изпълнението се проследява чрез пратки, с частични доставки и остатъци."
        actions={
          can(ctx.role, "write") && (
            <ButtonLink href="/orders/new">
              <Plus className="h-4 w-4" />
              Нова поръчка
            </ButtonLink>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex w-fit gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
          {[
            ["all", "Всички"],
            ["purchase", "Доставки"],
            ["sales", "Клиентски"],
          ].map(([v, l]) => (
            <Link key={v} href={href(v, status)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", type === v ? "bg-accent-soft text-accent" : "text-muted hover:text-text")}>
              {l}
            </Link>
          ))}
        </div>
        <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
          {(["all", ...ORDER_STATUSES] as const).map((v) => (
            <Link key={v} href={href(type, v)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", status === v ? "bg-accent-soft text-accent" : "text-muted hover:text-text")}>
              {v === "all" ? "Всички статуси" : label(v)}
            </Link>
          ))}
        </div>
      </div>

      <FilterBar action="/orders" resetHref={q ? href(type, status).replace(/&q=[^&]*/, "") : undefined}>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="status" value={status} />
        <div className="min-w-56 flex-1">
          <Input name="q" placeholder="Търсене по номер или партньор…" defaultValue={q} />
        </div>
      </FilterBar>

      <TableWrap>
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Няма поръчки" description="Създайте поръчка за доставка към доставчик или клиентска поръчка." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Тип</th>
                <th>Партньор</th>
                <th>Статус</th>
                <th>Очаквана</th>
                <th className="text-right">Изпълнение</th>
                <th className="text-right">Стойност</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const ordered = o.lines.reduce((s, l) => s + l.quantity, 0);
                const done = o.lines.reduce((s, l) => s + Math.min(l.quantity, l.fulfilledQuantity), 0);
                const value = sumLines(o.lines, (l) => l.quantity, (l) => l.unitPrice);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="font-medium hover:text-accent">
                        {o.number}
                      </Link>
                      <div className="text-xs text-muted">{formatDate(o.orderDate)}</div>
                    </td>
                    <td>
                      <Badge tone={o.type === "purchase" ? "info" : "accent"}>{o.type === "purchase" ? "Доставка" : "Клиентска"}</Badge>
                    </td>
                    <td className="text-muted">{o.partner?.name ?? "—"}</td>
                    <td>
                      <Badge tone={statusTone[o.status]}>{label(o.status)}</Badge>
                    </td>
                    <td className="text-muted">{formatDate(o.expectedDate)}</td>
                    <td className="text-right tabular-nums">
                      {done} / {ordered}
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(value, ctx.org.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableWrap>
      <Pagination basePath="/orders" searchParams={sp} page={page} pageSize={pageSize} total={total} noun="поръчки" />
    </>
  );
}
