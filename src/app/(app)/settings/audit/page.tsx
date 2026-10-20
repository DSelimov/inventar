import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { AUDIT_ACTION_LABELS, ENTITY_LABELS, listAudit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Одит" };

export default async function AuditPage() {
  const ctx = await requireContext("manage");
  const rows = await listAudit(ctx.db);
  return (
    <Card>
      {rows.length === 0 ? (
        <CardBody className="text-sm text-muted">Все още няма записи.</CardBody>
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
  );
}
