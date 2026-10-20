import type { Metadata } from "next";
import { Building2, Database, KeyRound, Users } from "lucide-react";
import { ORG_STATUS, OrgStatusBadge } from "@/components/admin/org-status";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/search-form";
import { StatCard } from "@/components/ui/stat-card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableWrap } from "@/components/ui/table";
import { ORG_STATUSES, type OrgStatus } from "@/db/control-schema";
import { activateOrganization, retryProvisioning, suspendOrganization } from "@/lib/actions/admin";
import { param, type SearchParams } from "@/lib/paging";
import { listOrganizationsWithStats, platformStats, requirePlatformAdmin } from "@/lib/platform";
import { APP_DOMAIN, tenantUrl } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Платформа" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const q = param(sp, "q").toLowerCase();
  const status = (ORG_STATUSES as readonly string[]).includes(param(sp, "status")) ? (param(sp, "status") as OrgStatus) : "";
  const [all, stats] = await Promise.all([listOrganizationsWithStats(), platformStats()]);
  const rows = all.filter((r) => (!status || r.org.status === status) && (!q || `${r.org.name} ${r.org.subdomain} ${r.owner ?? ""} ${r.org.dbName}`.toLowerCase().includes(q)));
  const attention = (stats.status.failed ?? 0) + (stats.status.provisioning ?? 0);

  return (
    <>
      <PageHeader title="Организации" description={`Всички клиенти на ${APP_DOMAIN}: всеки със собствен поддомейн и база данни.`} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Организации" value={stats.organizations} hint={`${stats.status.active ?? 0} активни · ${stats.status.suspended ?? 0} спрени`} icon={Building2} tone="accent" />
        <StatCard label="Нужно внимание" value={attention} hint="неуспешна или незавършена подготовка" icon={Database} tone={attention ? "danger" : "neutral"} />
        <StatCard label="Потребители" value={stats.users} hint={`${stats.activeSessions} активни сесии · ${stats.platformAdmins} админ.`} icon={Users} />
        <StatCard label="Пул от бази" value={`${stats.pool.free} свободни`} hint={`${stats.pool.assigned} заети (режим manual)`} icon={KeyRound} />
      </div>

      <FilterBar action="/admin" resetHref={q || status ? "/admin" : undefined}>
        <div className="min-w-56 flex-1">
          <Input name="q" placeholder="Име, поддомейн, собственик, база…" defaultValue={param(sp, "q")} />
        </div>
        <Select name="status" defaultValue={status} className="w-auto">
          <option value="">Всички статуси</option>
          {ORG_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORG_STATUS[s].label}
            </option>
          ))}
        </Select>
      </FilterBar>

      <TableWrap>
        {rows.length === 0 ? (
          <EmptyState icon={Building2} title="Няма организации" description={q || status ? "Няма съвпадения с филтрите." : "Все още никой не се е регистрирал."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Организация</th>
                <th>Статус</th>
                <th>База</th>
                <th className="text-right">Потребители</th>
                <th>Създадена</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ org, members, owner, poolHost }) => (
                <tr key={org.id}>
                  <td>
                    <div className="font-medium">{org.name}</div>
                    <a href={tenantUrl(org.subdomain)} className="font-mono text-xs text-muted hover:text-accent">
                      {org.subdomain}.{APP_DOMAIN}
                    </a>
                    {owner && <div className="text-xs text-muted">{owner}</div>}
                  </td>
                  <td>
                    <OrgStatusBadge status={org.status} />
                  </td>
                  <td className="font-mono text-xs">
                    {org.dbName}
                    <div className="text-muted">{poolHost ? `пул · ${poolHost}` : org.dbHost ?? "основен сървър"}</div>
                  </td>
                  <td className="text-right tabular-nums">{members}</td>
                  <td className="whitespace-nowrap text-muted">{formatDate(org.createdAt)}</td>
                  <td className="text-right">
                    {org.status === "active" && (
                      <Form action={suspendOrganization.bind(null, org.id)}>
                        <ConfirmButton variant="ghost" size="sm" message={`Да спра ли „${org.name}“? Потребителите и API ключовете ѝ губят достъп до активиране. Данните се запазват.`}>
                          Спри
                        </ConfirmButton>
                      </Form>
                    )}
                    {org.status === "suspended" && (
                      <Form action={activateOrganization.bind(null, org.id)}>
                        <SubmitButton variant="secondary" size="sm">
                          Активирай
                        </SubmitButton>
                      </Form>
                    )}
                    {(org.status === "failed" || org.status === "provisioning") && (
                      <Form action={retryProvisioning.bind(null, org.id)}>
                        <SubmitButton variant="secondary" size="sm">
                          Опитай отново
                        </SubmitButton>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
      <p className="mt-3 text-xs text-muted">
        {rows.length} от {all.length} организации.
      </p>
    </>
  );
}
