import type { Metadata } from "next";
import { Pause, Play, Send, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { WEBHOOK_EVENTS } from "@/db/tenant-schema";
import { createWebhook, deleteWebhook, sendTestWebhook, toggleWebhook } from "@/lib/actions/webhooks";
import { requireContext } from "@/lib/auth";
import { listWebhooks } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";
import { WEBHOOK_EVENT_LABELS } from "@/lib/webhooks";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const ctx = await requireContext("manage");
  const hooks = await listWebhooks(ctx.db);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {hooks.length === 0 && (
          <Card>
            <CardBody className="text-sm text-muted">
              Няма webhooks. Добавете URL, на който системата да изпраща събития (JSON POST, подписани с HMAC-SHA256 в заглавието <code>X-Inventory-Signature</code>).
            </CardBody>
          </Card>
        )}
        {hooks.map((h) => (
          <Card key={h.id}>
            <CardHeader
              title={<span className="break-all font-mono text-xs">{h.url}</span>}
              description={h.events.length ? h.events.map((e) => WEBHOOK_EVENT_LABELS[e as keyof typeof WEBHOOK_EVENT_LABELS] ?? e).join(", ") : "Всички събития"}
              actions={
                <>
                  <Badge tone={h.active ? "success" : "neutral"}>{h.active ? "Активен" : "Спрян"}</Badge>
                  <form action={toggleWebhook.bind(null, h.id, !h.active)}>
                    <Button type="submit" variant="ghost" size="sm" aria-label={h.active ? "Спри" : "Пусни"}>
                      {h.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                  </form>
                  <form action={deleteWebhook.bind(null, h.id)}>
                    <ConfirmButton variant="ghost" size="sm" message="Да изтрия ли този webhook?" aria-label="Изтрий">
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </form>
                </>
              }
            />
            <CardBody className="space-y-2 text-sm">
              <div className="text-xs text-muted">
                Таен ключ: <code className="select-all font-mono">{h.secret}</code>
              </div>
              {h.deliveries.length === 0 ? (
                <p className="text-xs text-muted">Все още няма изпратени събития.</p>
              ) : (
                <ul className="divide-y divide-line text-xs">
                  {h.deliveries.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-1.5">
                      <Badge tone={d.success ? "success" : "danger"}>{d.statusCode ?? "—"}</Badge>
                      <span className="font-mono">{d.event}</span>
                      <span className="flex-1 truncate text-muted">{d.error ?? ""}</span>
                      <span className="text-muted">{formatDateTime(d.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        ))}
        {hooks.length > 0 && (
          <form action={sendTestWebhook}>
            <Button type="submit" variant="secondary" size="sm">
              <Send className="h-4 w-4" /> Изпрати тестово събитие
            </Button>
          </form>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader title="Нов webhook" />
        <CardBody>
          <form action={createWebhook} className="space-y-3">
            <Field label="URL">
              <Input name="url" type="url" required placeholder="https://example.com/hooks/inventory" />
            </Field>
            <Field label="Таен ключ" hint="Оставете празно за автоматично генериране.">
              <Input name="secret" className="font-mono" />
            </Field>
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium">Събития (празно = всички)</legend>
              <div className="space-y-1.5">
                {WEBHOOK_EVENTS.map((e) => (
                  <div key={e}>
                    <Checkbox name="events" value={e} label={<span>{WEBHOOK_EVENT_LABELS[e]} <span className="font-mono text-xs text-muted">{e}</span></span>} />
                  </div>
                ))}
              </div>
            </fieldset>
            <SubmitButton className="w-full">
              <WebhookIcon className="h-4 w-4" /> Добави
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
