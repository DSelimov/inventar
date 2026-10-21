import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Printer, X } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { applyWriteOffAction, cancelWriteOffAction } from "@/lib/actions/write-offs";
import { requireContext } from "@/lib/auth";
import { lineTotal, sumMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getWriteOff } from "@/lib/queries";
import { formatDateTime, formatMoney, formatNumber, label } from "@/lib/utils";

export const metadata: Metadata = { title: "Протокол за брак" };

export default async function WriteOffPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const wo = await getWriteOff(ctx.db, id);
  if (!wo) notFound();
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const draft = wo.status === "draft";
  const lines = wo.lines.map((l) => ({ ...l, cost: l.unitCost ?? l.item.unitCost, total: l.value ?? lineTotal(l.quantity, l.unitCost ?? l.item.unitCost) }));

  return (
    <>
      <PageHeader
        title={wo.number}
        description={`${wo.location?.name ?? "—"} · ${wo.reason}`}
        back={{ href: "/write-offs", label: "Брак" }}
        actions={
          <a href={`/print/write-offs/${wo.id}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
            <Printer className="h-4 w-4" /> Протокол (PDF)
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Стока" description={draft ? "Стойността е по текущата себестойност — окончателната се записва при прилагане." : `Изписано на ${formatDateTime(wo.appliedAt)} от ${wo.appliedBy ?? "—"}.`} />
          <Table>
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Партида</th>
                <th className="text-right">Количество</th>
                <th className="text-right">Себестойност</th>
                <th className="text-right">Стойност</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/items/${l.itemId}`} className="font-medium hover:text-accent">
                      {l.item.name}
                      {l.item.variantLabel && <span className="text-muted"> · {l.item.variantLabel}</span>}
                    </Link>
                    <div className="font-mono text-xs text-muted">{l.item.sku}</div>
                  </td>
                  <td className="font-mono text-xs">{l.lot?.lotNumber ?? "—"}</td>
                  <td className="text-right tabular-nums">
                    {formatNumber(l.quantity)} {l.item.unit}
                  </td>
                  <td className="text-right tabular-nums text-muted">{money(l.cost)}</td>
                  <td className="text-right tabular-nums font-medium">{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="border-t border-line px-5 py-3 text-right text-sm font-semibold tabular-nums">Общо: {money(sumMoney(lines.map((l) => l.total)))}</div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Статус" />
            <CardBody className="space-y-3">
              <Badge tone={statusTone[wo.status] ?? "neutral"}>{label(wo.status)}</Badge>
              {draft && can(ctx.role, "delete") && (
                <Form action={applyWriteOffAction.bind(null, wo.id)}>
                  <ConfirmButton className="w-full" message={`Да изпиша ли стоката по ${wo.number}? Наличността намалява, действието не се отменя.`}>
                    <Check className="h-4 w-4" /> Приложи (изпиши)
                  </ConfirmButton>
                </Form>
              )}
              {draft && !can(ctx.role, "delete") && <p className="text-sm text-muted">Изписването се прави от мениджър или администратор.</p>}
              {draft && can(ctx.role, "write") && (
                <Form action={cancelWriteOffAction.bind(null, wo.id)}>
                  <ConfirmButton variant="secondary" className="w-full" message="Да откажа ли протокола? Наличността не се променя.">
                    <X className="h-4 w-4" /> Откажи
                  </ConfirmButton>
                </Form>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Комисия" />
            <CardBody className="space-y-1 text-sm">
              {(wo.commission ?? "")
                .split("\n")
                .filter((s) => s.trim())
                .map((s) => (
                  <div key={s}>{s}</div>
                ))}
              {!wo.commission && <span className="text-muted">Не е посочена.</span>}
              {wo.notes && <p className="mt-3 text-muted">{wo.notes}</p>}
              <p className="mt-3 text-xs text-muted">Създаден от {wo.createdBy ?? "—"} на {formatDateTime(wo.createdAt)}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
