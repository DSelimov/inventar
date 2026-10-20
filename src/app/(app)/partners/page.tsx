import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/search-form";
import { Table, TableWrap } from "@/components/ui/table";
import type { PartnerType } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { pageParam, param, type SearchParams } from "@/lib/paging";
import { pagePartners } from "@/lib/queries";
import { cn, label } from "@/lib/utils";

export const metadata: Metadata = { title: "Партньори" };

export default async function PartnersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const type = (["supplier", "customer"].includes(param(sp, "type")) ? param(sp, "type") : "all") as PartnerType | "all";
  const q = param(sp, "q");
  const { rows, total, page, pageSize } = await pagePartners(ctx.db, { type, q }, pageParam(sp));
  const tabHref = (v: string) => {
    const qs = new URLSearchParams();
    if (v !== "all") qs.set("type", v);
    if (q) qs.set("q", q);
    return `/partners${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Партньори"
        description="Доставчици и клиенти с история на поръчките и срокове на доставка."
        actions={
          can(ctx.role, "write") && (
            <ButtonLink href="/partners/new">
              <Plus className="h-4 w-4" /> Нов партньор
            </ButtonLink>
          )
        }
      />
      <div className="mb-4 flex w-fit gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
        {[
          ["all", "Всички"],
          ["supplier", "Доставчици"],
          ["customer", "Клиенти"],
        ].map(([v, l]) => (
          <Link key={v} href={tabHref(v)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", type === v ? "bg-accent-soft text-accent" : "text-muted hover:text-text")}>
            {l}
          </Link>
        ))}
      </div>
      <FilterBar action="/partners" resetHref={q ? (type === "all" ? "/partners" : `/partners?type=${type}`) : undefined}>
        {type !== "all" && <input type="hidden" name="type" value={type} />}
        <div className="min-w-56 flex-1">
          <Input name="q" placeholder="Име, имейл, телефон, ЕИК…" defaultValue={q} />
        </div>
      </FilterBar>
      <TableWrap>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="Няма партньори" description="Добавете доставчици и клиенти, за да ги избирате в поръчки и пратки." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Име</th>
                <th>Тип</th>
                <th>Контакт</th>
                <th className="text-right">Срок на доставка</th>
                <th className="text-right">Поръчки</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/partners/${p.id}`} className="font-medium hover:text-accent">
                      {p.name}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={p.type === "supplier" ? "info" : p.type === "customer" ? "accent" : "neutral"}>{label(p.type)}</Badge>
                  </td>
                  <td className="text-muted">{[p.email, p.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="text-right tabular-nums text-muted">{p.leadTimeDays ? `${p.leadTimeDays} дни` : "—"}</td>
                  <td className="text-right tabular-nums">{p.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
      <Pagination basePath="/partners" searchParams={sp} page={page} pageSize={pageSize} total={total} noun="партньори" />
    </>
  );
}
