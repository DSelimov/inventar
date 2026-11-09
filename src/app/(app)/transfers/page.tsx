import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeftRight, ArrowRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap } from "@/components/ui/table";
import type { TransferStatus } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { param, type SearchParams } from "@/lib/paging";
import { can } from "@/lib/permissions";
import { listLocationsFor } from "@/lib/queries";
import { listTransfers, TRANSFER_STATUS_LABELS } from "@/lib/transfers";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Трансфери" };

export default async function TransfersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const status = (["draft", "completed"] as const).find((s) => s === param(sp, "status")) ?? null;
  const locationId = Number(param(sp, "location")) || null;
  const [rows, locations] = await Promise.all([listTransfers(ctx.db, { status, locationId, allowed: ctx.locations }), listLocationsFor(ctx)]);
  const href = (s: TransferStatus | null, l: number | null) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (l) p.set("location", String(l));
    return `/transfers${p.size ? `?${p}` : ""}`;
  };
  const tab = (active: boolean) => cn("rounded-lg px-3 py-1.5 text-sm font-medium", active ? "bg-accent text-white" : "text-accent hover:bg-surface-2");

  return (
    <>
      <PageHeader
        help="transfers"
        title="Трансфери"
        description="Преместване на стока между обекти — склад, аптеки, хладилна камера. Черновата не променя наличността; „Изпълни“ я мести наведнъж."
        actions={
          can(ctx.role, "write") && (
            <ButtonLink href="/transfers/new">
              <Plus className="h-4 w-4" /> Нов трансфер
            </ButtonLink>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex w-fit gap-1 rounded-lg border border-line bg-surface p-1">
          <Link href={href(null, locationId)} className={tab(!status)}>
            Всички
          </Link>
          <Link href={href("draft", locationId)} className={tab(status === "draft")}>
            Чернови
          </Link>
          <Link href={href("completed", locationId)} className={tab(status === "completed")}>
            Изпълнени
          </Link>
        </div>
        {locations.length > 1 && (
          <div className="flex w-fit flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
            <Link href={href(status, null)} className={tab(!locationId)}>
              Всички обекти
            </Link>
            {locations.map((l) => (
              <Link key={l.id} href={href(status, l.id)} className={tab(locationId === l.id)}>
                {l.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <TableWrap>
        {rows.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Няма трансфери"
            description="Трансферът мести стока от един обект в друг, напр. зареждане на аптеката от централния склад."
            action={can(ctx.role, "write") ? <ButtonLink href="/transfers/new">Нов трансфер</ButtonLink> : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>От → Към</th>
                <th className="text-right">Редове</th>
                <th className="text-right">Единици</th>
                <th>Статус</th>
                <th>Създаден</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/transfers/${t.id}`} className="font-bold text-accent hover:underline">
                      {t.number}
                    </Link>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      {t.fromName} <ArrowRight className="h-3.5 w-3.5 text-muted" /> {t.toName}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{t.lines}</td>
                  <td className="text-right tabular-nums">{formatNumber(t.units)}</td>
                  <td>
                    <Badge tone={t.status === "completed" ? "success" : "neutral"}>{TRANSFER_STATUS_LABELS[t.status]}</Badge>
                    {t.completedAt && <div className="mt-0.5 text-xs text-muted">{formatDateTime(t.completedAt)}</div>}
                  </td>
                  <td className="text-sm">
                    {formatDateTime(t.createdAt)}
                    {t.createdByName && <div className="text-xs text-muted">{t.createdByName}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
    </>
  );
}
