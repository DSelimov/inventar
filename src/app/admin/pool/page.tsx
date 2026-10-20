import type { Metadata } from "next";
import { Database, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { addPoolDatabase, removePoolDatabase } from "@/lib/actions/admin";
import { listPool, requirePlatformAdmin } from "@/lib/platform";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Пул от бази" };

export default async function PoolPage() {
  await requirePlatformAdmin();
  const rows = await listPool();
  const mode = process.env.TENANT_DB_MODE ?? "auto";

  return (
    <>
      <PageHeader
        title="Пул от бази"
        description="Предварително създадени бази за режим manual (споделен хостинг без CREATE DATABASE): всяка нова организация получава първата свободна."
      />
      {mode !== "manual" && (
        <p className="mb-4 rounded-xl bg-accent-soft px-4 py-2 text-sm text-accent">
          Текущият режим е <strong>{mode}</strong>: новите организации получават база чрез CREATE DATABASE и пулът не се използва.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Бази" description={`${rows.filter((r) => !r.entry.assignedOrganizationId).length} свободни от ${rows.length}`} />
          {rows.length === 0 ? (
            <EmptyState icon={Database} title="Пулът е празен" description="Създайте база в hPanel и я добавете тук (или с pnpm db:pool:add)." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>База</th>
                  <th>Сървър</th>
                  <th>Организация</th>
                  <th>Добавена</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry, org }) => (
                  <tr key={entry.id}>
                    <td className="font-mono text-xs">
                      {entry.dbName}
                      <div className="text-muted">{entry.dbUser}</div>
                    </td>
                    <td className="font-mono text-xs text-muted">
                      {entry.dbHost}:{entry.dbPort}
                    </td>
                    <td>{org?.id ? <span className="text-sm">{org.name}</span> : <Badge tone="success">Свободна</Badge>}</td>
                    <td className="whitespace-nowrap text-muted">{formatDate(entry.createdAt)}</td>
                    <td className="text-right">
                      {!entry.assignedOrganizationId && (
                        <Form action={removePoolDatabase.bind(null, entry.id)}>
                          <ConfirmButton variant="ghost" size="sm" message={`Да премахна ли ${entry.dbName} от пула? Самата база не се изтрива.`} aria-label="Премахни">
                            <Trash2 className="h-4 w-4" />
                          </ConfirmButton>
                        </Form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Добави база" description="Връзката се проверява преди записа. Паролата се пази криптирана (APP_SECRET)." />
          <CardBody>
            <Form action={addPoolDatabase} className="space-y-3">
              <Field label="Име на базата">
                <Input name="dbName" required className="font-mono" placeholder="u123456_inv01" />
              </Field>
              <Field label="Потребител">
                <Input name="dbUser" required className="font-mono" autoComplete="off" />
              </Field>
              <Field label="Парола">
                <Input name="dbPassword" type="password" autoComplete="new-password" />
              </Field>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Field label="Сървър">
                  <Input name="dbHost" placeholder="localhost" className="font-mono" />
                </Field>
                <Field label="Порт">
                  <Input name="dbPort" type="number" placeholder="3306" />
                </Field>
              </div>
              <SubmitButton className="w-full">
                <Plus className="h-4 w-4" />
                Добави в пула
              </SubmitButton>
            </Form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
