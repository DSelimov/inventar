import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import type { Plan } from "@/db/control-schema";
import { requireContext } from "@/lib/auth";
import { LIMIT_LABELS, listPlans, PLAN_CONTACT, planOf, subscriptionState, usage, type LimitKey } from "@/lib/plans";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Абонамент" };

const STATUS_TEXT = { trial: "Пробен период", active: "Активен", past_due: "Неплатен", cancelled: "Прекратен" } as const;
const limits = (p: Plan): Record<LimitKey, number | null> => ({ users: p.maxUsers, items: p.maxItems, locations: p.maxLocations, invoices: p.maxInvoicesPerMonth });

export default async function PlanPage() {
  const ctx = await requireContext();
  const [plan, plans, used] = await Promise.all([planOf(ctx.org), listPlans(), usage(ctx.org, ctx.db)]);
  const sub = subscriptionState(ctx.org);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={plan ? `План „${plan.name}“` : "Без план"} description={plan ? `${formatMoney(plan.monthlyPrice, plan.currency)} на месец` : "Всички функции, без лимити."} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={sub.readOnly ? "danger" : ctx.org.subscriptionStatus === "trial" ? "info" : "success"}>{STATUS_TEXT[ctx.org.subscriptionStatus]}</Badge>
            {ctx.org.subscriptionStatus === "trial" && ctx.org.trialEndsAt && <span className="text-muted">до {formatDate(ctx.org.trialEndsAt)}</span>}
            {ctx.org.paidUntil && <span className="text-muted">платено до {formatDate(ctx.org.paidUntil)}</span>}
          </div>
          {(sub.message || sub.warning) && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{sub.message ?? sub.warning}</p>}
          {plan && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(LIMIT_LABELS) as LimitKey[]).map((k) => {
                const max = limits(plan)[k];
                const pct = max ? Math.min(100, Math.round((used[k] / max) * 100)) : 0;
                return (
                  <div key={k} className="rounded-xl border border-line p-3">
                    <div className="text-xs uppercase tracking-wide text-muted">{LIMIT_LABELS[k]}</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">
                      {formatNumber(used[k])}
                      <span className="text-sm font-normal text-muted"> / {max === null ? "без лимит" : formatNumber(max)}</span>
                    </div>
                    {max !== null && (
                      <div className="mt-2 h-1.5 rounded-full bg-line">
                        <div className={`h-1.5 rounded-full ${pct >= 90 ? "bg-danger" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-sm text-muted">
            За смяна на плана или плащане пишете на{" "}
            <a href={`mailto:${PLAN_CONTACT}`} className="text-accent hover:underline">
              {PLAN_CONTACT}
            </a>
            . Онлайн плащането предстои.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Планове" />
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <th></th>
                {plans.map((p) => (
                  <th key={p.id} className="text-right">
                    {p.name}
                    {p.id === plan?.id && <div className="text-[10px] font-normal normal-case text-accent">текущ</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Цена на месец</td>
                {plans.map((p) => (
                  <td key={p.id} className="text-right font-medium tabular-nums">
                    {formatMoney(p.monthlyPrice, p.currency)}
                  </td>
                ))}
              </tr>
              {(Object.keys(LIMIT_LABELS) as LimitKey[]).map((k) => (
                <tr key={k}>
                  <td className="capitalize">{LIMIT_LABELS[k]}</td>
                  {plans.map((p) => (
                    <td key={p.id} className="text-right tabular-nums">
                      {limits(p)[k] === null ? "без лимит" : formatNumber(limits(p)[k]!)}
                    </td>
                  ))}
                </tr>
              ))}
              {(
                [
                  ["REST API и webhooks", "apiAccess"],
                  ["Интеграции (куриери, счетоводство)", "integrations"],
                ] as const
              ).map(([text, key]) => (
                <tr key={key}>
                  <td>{text}</td>
                  {plans.map((p) => (
                    <td key={p.id} className="text-right">
                      {p[key] ? <Check className="ml-auto h-4 w-4 text-success" /> : <Minus className="ml-auto h-4 w-4 text-muted" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
