import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Pencil, Printer, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { completeTransferAction, deleteTransferAction } from "@/lib/actions/transfers";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getTransfer, TRANSFER_STATUS_LABELS, transferMovedLots } from "@/lib/transfers";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const ctx = await requireContext();
  const t = await getTransfer(ctx.db, Number((await params).id));
  return { title: t ? `Трансфер ${t.number}` : "Трансфер" };
}

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const id = Number((await params).id);
  const t = await getTransfer(ctx.db, id);
  if (!t) notFound();
  const draft = t.status === "draft";
  const write = can(ctx.role, "write");

  const moved = draft ? [] : await transferMovedLots(ctx.db, t.number);
  const lotsFor = (itemId: number) => moved.filter((m) => m.itemId === itemId && m.lotNumber);
  const units = t.lines.reduce((s, l) => Math.round((s + l.quantity) * 1000) / 1000, 0);

  return (
    <>
      <PageHeader
        help="transfers"
        title={`Трансфер ${t.number}`}
        back={{ href: "/transfers", label: "Трансфери" }}
        actions={
          <>
            <a href={`/print/transfers/${id}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
              <Printer className="h-4 w-4" /> Печат (PDF)
            </a>
            {draft && write && (
              <ButtonLink href={`/transfers/${id}/edit`} variant="secondary">
                <Pencil className="h-4 w-4" /> Редактирай
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Стока" description={`${t.lines.length} реда · ${formatNumber(units)} единици`} />
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th>Партида</th>
                  <th className="text-right">Количество</th>
                </tr>
              </thead>
              <tbody>
                {t.lines.map((l) => {
                  const done = lotsFor(l.itemId);
                  return (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/items/${l.itemId}`} className="text-accent hover:underline">
                          {l.name}
                          {l.variant && <span className="text-muted"> · {l.variant}</span>}
                        </Link>
                        <div className="font-mono text-xs text-muted">{l.sku}</div>
                      </td>
                      <td className="text-sm">
                        {l.tracking === "none" ? (
                          "—"
                        ) : l.lotNumber ? (
                          <span className="font-mono">
                            {l.lotNumber}
                            {l.expiryDate && <span className="text-muted"> · до {formatDate(l.expiryDate, "dd.MM.yyyy")}</span>}
                          </span>
                        ) : done.length ? (
                          done.map((m, i) => (
                            <div key={i} className="font-mono">
                              {m.lotNumber} · {formatNumber(m.quantity)}
                              {m.expiryDate && <span className="text-muted"> · до {formatDate(m.expiryDate, "dd.MM.yyyy")}</span>}
                            </div>
                          ))
                        ) : (
                          <span className="text-muted">по най-близък срок</span>
                        )}
                      </td>
                      <td className="text-right font-bold tabular-nums">
                        {formatNumber(l.quantity)} <span className="font-normal text-muted">{l.unit}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
          {t.notes && (
            <Card className="mt-6">
              <CardHeader title="Бележка" />
              <CardBody className="whitespace-pre-line text-sm">{t.notes}</CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Статус" />
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-base">
                <span>{t.from?.name}</span>
                <ArrowRight className="h-4 w-4 text-muted" />
                <span>{t.to?.name}</span>
              </div>
              <Badge tone={draft ? "neutral" : "success"}>{TRANSFER_STATUS_LABELS[t.status]}</Badge>
              <p className="text-muted">
                Създаден {formatDateTime(t.createdAt)}
                {t.createdByName ? ` от ${t.createdByName}` : ""}.
              </p>
              {!draft && (
                <p className="text-muted">
                  Изпълнен {formatDateTime(t.completedAt)}
                  {t.completedByName ? ` от ${t.completedByName}` : ""}. Наличността е преместена.
                </p>
              )}
              {draft && write && (
                <>
                  <p className="text-muted">Черновата още не променя наличността.</p>
                  <Form action={completeTransferAction.bind(null, id)}>
                    <ConfirmButton className="w-full" message={`Да преместя ли стоката по ${t.number} от „${t.from?.name}“ в „${t.to?.name}“?`}>
                      <Check className="h-4 w-4" /> Изпълни трансфера
                    </ConfirmButton>
                  </Form>
                  <Form action={deleteTransferAction.bind(null, id)}>
                    <ConfirmButton variant="secondary" className="w-full" message={`Да изтрия ли черновата ${t.number}?`}>
                      <Trash2 className="h-4 w-4" /> Изтрий черновата
                    </ConfirmButton>
                  </Form>
                </>
              )}
              {!draft && write && (
                <ButtonLink href={`/transfers/new?from=${t.toLocationId}&to=${t.fromLocationId}`} variant="secondary" className="w-full">
                  Обратен трансфер
                </ButtonLink>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
