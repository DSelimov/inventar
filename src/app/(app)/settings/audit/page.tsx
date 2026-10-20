import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/fields";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/search-form";
import { Table } from "@/components/ui/table";
import { AUDIT_ACTION_LABELS, ENTITY_LABELS, pageAudit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { pageParam, param, type SearchParams } from "@/lib/paging";
import { formatDateTime } from "@/lib/utils";

const isDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export const metadata: Metadata = { title: "Одит" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext("manage");
  const sp = await searchParams;
  const f = {
    action: AUDIT_ACTION_LABELS[param(sp, "action")] ? param(sp, "action") : "",
    entity: ENTITY_LABELS[param(sp, "entity")] ? param(sp, "entity") : "",
    user: param(sp, "user"),
    q: param(sp, "q"),
    from: isDate(param(sp, "from")),
    to: isDate(param(sp, "to")),
  };
  const { rows, total, page, pageSize } = await pageAudit(ctx.db, f, pageParam(sp));
  const filtered = Object.values(f).some(Boolean);
  return (
    <>
    <FilterBar action="/settings/audit" resetHref={filtered ? "/settings/audit" : undefined}>
      <div className="min-w-48 flex-1">
        <Input name="q" placeholder="Търсене в детайлите…" defaultValue={f.q} />
      </div>
      <Input name="user" placeholder="Потребител" defaultValue={f.user} className="w-40" />
      <Select name="action" defaultValue={f.action} className="w-auto">
        <option value="">Всички действия</option>
        {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
      <Select name="entity" defaultValue={f.entity} className="w-auto">
        <option value="">Всички обекти</option>
        {Object.entries(ENTITY_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
      <Input name="from" type="date" defaultValue={f.from} className="w-auto" aria-label="От дата" />
      <Input name="to" type="date" defaultValue={f.to} className="w-auto" aria-label="До дата" />
    </FilterBar>
    <Card>
      {rows.length === 0 ? (
        <CardBody className="text-sm text-muted">{filtered ? "Няма записи по тези филтри." : "Все още няма записи."}</CardBody>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Кога</th>
              <th>Кой</th>
              <th>Действие</th>
              <th>Обект</th>
              <th>Детайли</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</td>
                <td>{r.userName ?? "—"}</td>
                <td>
                  <Badge tone={r.action === "delete" ? "danger" : r.action === "create" ? "success" : "neutral"}>{AUDIT_ACTION_LABELS[r.action] ?? r.action}</Badge>
                </td>
                <td>
                  {ENTITY_LABELS[r.entity] ?? r.entity}
                  {r.entityId ? <span className="text-muted"> #{r.entityId}</span> : null}
                </td>
                <td className="max-w-md truncate font-mono text-xs text-muted">{r.details ? JSON.stringify(r.details) : ""}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
    <Pagination basePath="/settings/audit" searchParams={sp} page={page} pageSize={pageSize} total={total} noun="записа" />
    </>
  );
}
