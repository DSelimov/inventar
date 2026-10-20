import Link from "next/link";
import type { Metadata } from "next";
import { History } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/search-form";
import { Table, TableWrap } from "@/components/ui/table";
import { MOVEMENT_TYPES, type MovementType } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { pageParam, param, type SearchParams } from "@/lib/paging";
import { listLocations, listMovementUsers, pageMovements } from "@/lib/queries";
import { formatDateTime, formatNumber, label } from "@/lib/utils";

export const metadata: Metadata = { title: "Движения" };

const isDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const positive = (v: string) => (/^\d+$/.test(v) && Number(v) > 0 ? Number(v) : undefined);

export default async function MovementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const filters = {
    q: param(sp, "q") || undefined,
    itemId: positive(param(sp, "item")),
    locationId: positive(param(sp, "location")),
    type: (MOVEMENT_TYPES as readonly string[]).includes(param(sp, "type")) ? (param(sp, "type") as MovementType) : undefined,
    from: isDate(param(sp, "from")),
    to: isDate(param(sp, "to")),
    userId: positive(param(sp, "user")),
  };
  const [{ rows, total, page, pageSize }, locations, users] = await Promise.all([pageMovements(ctx.db, filters, pageParam(sp)), listLocations(ctx.db, true), listMovementUsers(ctx.db)]);
  const filtered = Object.values(filters).some((v) => v !== undefined);
  const forItem = filters.itemId ? (rows[0]?.item ?? null) : null;

  return (
    <>
      <PageHeader title="Движения" description="Цялата складова история: приходи, разходи, корекции и трансфери, от всички артикули и локации." />

      <FilterBar action="/movements" resetHref={filtered ? "/movements" : undefined}>
        {filters.itemId && <input type="hidden" name="item" value={filters.itemId} />}
        <div className="min-w-56 flex-1">
          <Input name="q" placeholder="Артикул, код, баркод или причина…" defaultValue={filters.q} />
        </div>
        <Select name="type" defaultValue={filters.type ?? ""} className="w-auto">
          <option value="">Всички типове</option>
          {MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </Select>
        {locations.length > 1 && (
          <Select name="location" defaultValue={filters.locationId ?? ""} className="w-auto">
            <option value="">Всички локации</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <Select name="user" defaultValue={filters.userId ?? ""} className="w-auto">
          <option value="">Всички потребители</option>
          {users.map((u) => (
            <option key={`${u.id}-${u.name}`} value={u.id ?? ""}>
              {u.name}
            </option>
          ))}
        </Select>
        <Input name="from" type="date" defaultValue={filters.from} className="w-auto" aria-label="От дата" />
        <Input name="to" type="date" defaultValue={filters.to} className="w-auto" aria-label="До дата" />
      </FilterBar>

      {filters.itemId && (
        <p className="mb-3 text-sm text-muted">
          Само за артикул{" "}
          {forItem ? (
            <Link href={`/items/${forItem.id}`} className="font-medium text-text hover:text-accent">
              {forItem.name}
              {forItem.variantLabel && ` · ${forItem.variantLabel}`}
            </Link>
          ) : (
            `#${filters.itemId}`
          )}
          .{" "}
          <Link href="/movements" className="text-accent hover:underline">
            Покажи всички
          </Link>
        </p>
      )}

      <TableWrap>
        {rows.length === 0 ? (
          <EmptyState icon={History} title={filtered ? "Няма движения по тези филтри" : "Все още няма движения"} description={filtered ? "Опитайте друг период или изчистете филтрите." : "Движенията се записват при приход, разход, корекция, трансфер и доставка на пратки."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Кога</th>
                <th>Артикул</th>
                <th>Тип</th>
                <th>Локация</th>
                <th className="text-right">Промяна</th>
                <th className="text-right">Общо след</th>
                <th>Причина</th>
                <th>Кой</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(m.createdAt)}</td>
                  <td>
                    <Link href={`/items/${m.itemId}`} className="font-medium hover:text-accent">
                      {m.item.name}
                      {m.item.variantLabel && <span className="text-muted"> · {m.item.variantLabel}</span>}
                    </Link>
                    <div className="font-mono text-xs text-muted">{m.item.sku}</div>
                  </td>
                  <td>
                    <Badge tone={statusTone[m.type]}>{label(m.type)}</Badge>
                  </td>
                  <td className="text-muted">
                    {m.location?.name ?? "—"}
                    {m.lot && <span className="ml-1 font-mono text-xs">· {m.lot.lotNumber}</span>}
                  </td>
                  <td className={`text-right font-medium tabular-nums ${m.delta < 0 ? "text-danger" : "text-success"}`}>
                    {m.delta > 0 ? "+" : ""}
                    {formatNumber(m.delta)}
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(m.quantityAfter)}</td>
                  <td className="text-muted">
                    {m.shipment ? (
                      <Link href={`/shipments/${m.shipment.id}`} className="hover:text-accent">
                        {m.reason ?? m.shipment.reference}
                      </Link>
                    ) : (
                      (m.reason ?? "—")
                    )}
                  </td>
                  <td className="text-xs text-muted">{m.userName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
      <Pagination basePath="/movements" searchParams={sp} page={page} pageSize={pageSize} total={total} noun="движения" />
    </>
  );
}
