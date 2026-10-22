import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveIntegrationAction, testIntegrationAction } from "@/lib/actions/integrations";
import { requireContext } from "@/lib/auth";
import { getIntegration, PROVIDERS, recentLogs, type ProviderId } from "@/lib/integrations/core";
import { planOf } from "@/lib/plans";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Интеграции" };

export default async function IntegrationsPage() {
  const ctx = await requireContext("manage");
  const plan = await planOf(ctx.org);
  const ids = Object.keys(PROVIDERS) as ProviderId[];
  const configs = await Promise.all(ids.map(async (id) => ({ id, cfg: await getIntegration(ctx.db, id), logs: await recentLogs(ctx.db, id, 5) })));

  return (
    <div className="space-y-6">
      {plan && !plan.integrations && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">Планът „{plan.name}“ не включва интеграции — вижте Настройки › Абонамент.</p>
      )}
      <p className="text-sm text-muted">Данните за достъп се пазят криптирани. Куриерите създават товарителници от изходящите пратки; магазините получават наличността и изпращат поръчките си.</p>
      <div className="grid gap-6 xl:grid-cols-2">
        {configs.map(({ id, cfg, logs }) => {
          const p = PROVIDERS[id];
          return (
            <Card key={id}>
              <CardHeader
                title={p.name}
                description={p.kind === "courier" ? "Куриер" : "Онлайн магазин"}
                actions={<Badge tone={cfg.enabled ? "success" : "neutral"}>{cfg.enabled ? "включена" : "изключена"}</Badge>}
              />
              <CardBody className="space-y-4">
                <Form action={saveIntegrationAction.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
                  {p.credentials.map((f) => (
                    <Field key={f.key} label={f.label} hint={f.secret && cfg.credentials[f.key] ? "Запазена — празно оставя старата." : f.hint}>
                      <Input name={`c_${f.key}`} type={f.secret ? "password" : "text"} defaultValue={f.secret ? "" : (cfg.credentials[f.key] ?? "")} placeholder={f.placeholder} autoComplete="off" />
                    </Field>
                  ))}
                  {p.settings.map((f) => (
                    <Field key={f.key} label={f.label} hint={f.hint}>
                      <Input name={`s_${f.key}`} defaultValue={cfg.settings[f.key] ?? ""} placeholder={f.placeholder} />
                    </Field>
                  ))}
                  <div className="flex items-center justify-between gap-3 sm:col-span-2">
                    <Checkbox name="enabled" defaultChecked={cfg.enabled} label="Включена" />
                    <SubmitButton variant="secondary" size="sm">
                      Запази
                    </SubmitButton>
                  </div>
                </Form>
                {p.kind === "courier" && cfg.enabled && (
                  <Form action={testIntegrationAction.bind(null, id)}>
                    <SubmitButton variant="ghost" size="sm">
                      Провери връзката
                    </SubmitButton>
                  </Form>
                )}
                {logs.length > 0 && (
                  <ul className="space-y-1 border-t border-line pt-3 text-xs">
                    {logs.map((l) => (
                      <li key={l.id} className={l.ok ? "text-muted" : "text-danger"}>
                        {formatDateTime(l.createdAt)} · {l.action} · {l.httpStatus ?? "—"} · {l.durationMs} ms{l.message ? ` · ${l.message.slice(0, 120)}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <a href={p.docs} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                  Документация на {p.name}
                </a>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
