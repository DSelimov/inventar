import type { Metadata } from "next";
import { KeyRound, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { createApiKey, deleteApiKey, readNewKeyOnce } from "@/lib/actions/api-keys";
import { requireContext } from "@/lib/auth";
import { listApiKeys } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "API" };

const ENDPOINTS: Array<[string, string, string]> = [
  ["GET", "/api/v1/items?q=&page=1", "Списък артикули (търсене, страниране)"],
  ["POST", "/api/v1/items", "Създава артикул { sku, name, barcode?, categoryId?, unitCost?, unitPrice?, minQuantity?, unit? }"],
  ["GET", "/api/v1/items/{id}", "Артикул с наличност по локации и партиди"],
  ["PATCH", "/api/v1/items/{id}", "Променя полета на артикул"],
  ["GET", "/api/v1/stock?itemId=", "Наличности по локация"],
  ["POST", "/api/v1/movements", "Складово движение { itemId | sku, locationId, type: in|out|adjust, quantity, reason?, lotNumber?, lotId? }"],
  ["GET", "/api/v1/shipments?status=", "Пратки"],
  ["GET", "/api/v1/shipments/{id}", "Пратка с редове"],
  ["POST", "/api/v1/shipments/{id}/status", "Смяна на статус { status: in_transit|delivered|cancelled }"],
  ["GET", "/api/v1/orders?type=&status=", "Поръчки"],
  ["GET", "/api/v1/orders/{id}", "Поръчка с редове и пратки"],
  ["GET", "/api/v1/locations", "Локации"],
  ["GET", "/api/v1/partners", "Партньори"],
  ["GET", "/api/v1/categories", "Категории с полета"],
];

export default async function ApiPage() {
  const ctx = await requireContext("manage");
  const [keys, newKey] = await Promise.all([listApiKeys(ctx.org.id), readNewKeyOnce()]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {newKey && (
          <div className="rounded-2xl border border-success/30 bg-success-soft p-4 text-sm">
            <div className="font-medium text-success">Новият ключ е създаден. Копирайте го сега — няма да бъде показан отново.</div>
            <code className="mt-2 block select-all break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs">{newKey}</code>
          </div>
        )}
        <Card>
          <CardHeader title="API ключове" description="Използвайте ги като Authorization: Bearer <ключ>." />
          {keys.length === 0 ? (
            <CardBody className="text-sm text-muted">Няма създадени ключове.</CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Име</th>
                  <th>Ключ</th>
                  <th>Права</th>
                  <th>Последно използван</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="font-medium">{k.name}</td>
                    <td className="font-mono text-xs text-muted">{k.prefix}…</td>
                    <td className="space-x-1">
                      {k.scopes.map((s) => (
                        <Badge key={s} tone={s === "write" ? "warning" : "neutral"}>
                          {s === "write" ? "запис" : "четене"}
                        </Badge>
                      ))}
                    </td>
                    <td className="text-muted">{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "—"}</td>
                    <td className="text-right">
                      <form action={deleteApiKey.bind(null, k.id)}>
                        <ConfirmButton variant="ghost" size="sm" message="Да изтрия ли ключа? Интеграциите, които го ползват, ще спрат." aria-label="Изтрий">
                          <Trash2 className="h-4 w-4" />
                        </ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Крайни точки (REST, JSON)" description={`Базов адрес: ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}`} />
          <Table>
            <thead>
              <tr>
                <th>Метод</th>
                <th>Път</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(([m, p, d]) => (
                <tr key={m + p}>
                  <td>
                    <Badge tone={m === "GET" ? "info" : "warning"}>{m}</Badge>
                  </td>
                  <td className="font-mono text-xs">{p}</td>
                  <td className="text-muted">{d}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <CardBody className="text-xs text-muted">
            Пример:{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
              curl -H &quot;Authorization: Bearer inv_…&quot; {process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/v1/items
            </code>
          </CardBody>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader title="Нов ключ" />
        <CardBody>
          <form action={createApiKey} className="space-y-3">
            <Field label="Име" hint="За кого е ключът: онлайн магазин, счетоводство…">
              <Input name="name" required placeholder="напр. Онлайн магазин" />
            </Field>
            <Checkbox name="write" label="Разреши запис (създаване и промени)" />
            <SubmitButton className="w-full">
              <KeyRound className="h-4 w-4" /> Създай ключ
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
