import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap } from "@/components/ui/table";
import type { PartnerType } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listPartners } from "@/lib/queries";
import { cn, label } from "@/lib/utils";

export const metadata: Metadata = { title: "Партньори" };

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const type = (["supplier", "customer"].includes(sp.type ?? "") ? sp.type : "all") as PartnerType | "all";
  const rows = await listPartners(ctx.db, type);

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
          <Link key={v} href={v === "all" ? "/partners" : `/partners?type=${v}`} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", type === v ? "bg-accent-soft text-accent" : "text-muted hover:text-text")}>
            {l}
          </Link>
        ))}
      </div>
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
    </>
  );
}
