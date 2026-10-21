import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Printer, Save, X } from "lucide-react";
import { CountScanner } from "@/components/counts/count-scanner";
import { CountStatusBadge } from "@/components/counts/count-status";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Field, Input, Select } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { addCountLot, applyCount, cancelCount, saveCounts, scanCount } from "@/lib/actions/counts";
import { requireContext } from "@/lib/auth";
import { param, type SearchParams } from "@/lib/paging";
import { can } from "@/lib/permissions";
import { getStockCount } from "@/lib/queries";
import { cn, formatDateTime, formatMoney, formatNumber } from "@/lib/utils";
import { lineTotal, sumLines } from "@/lib/money";
import { itemDecimals, quantityStep } from "@/lib/quantity";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const count = await getStockCount(ctx.db, Number((await params).id));
  return { title: count?.number ?? "Инвентаризация" };
}

const SHOW = { all: "Всички", uncounted: "Неброени", diff: "С разлика" } as const;

export default async function CountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const count = await getStockCount(ctx.db, id);
  if (!count) notFound();
  const sp = await searchParams;
  const show = (param(sp, "show") in SHOW ? param(sp, "show") : "all") as keyof typeof SHOW;

  const open = count.status === "open";
  const writable = open && can(ctx.role, "write");
  const canApply = open && can(ctx.role, "delete");
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const lines = [...count.lines].sort((a, b) => a.item.name.localeCompare(b.item.name, "bg") || (a.lotNumber ?? "").localeCompare(b.lotNumber ?? ""));
  const counted = lines.filter((l) => l.counted !== null);
  const diffs = counted.filter((l) => l.counted !== l.expected);
  const valueDelta = sumLines(diffs, (l) => l.counted! - l.expected, (l) => l.item.unitCost);
  const shown = lines.filter((l) => (show === "uncounted" ? l.counted === null : show === "diff" ? l.counted !== null && l.counted !== l.expected : true));
  const tracked = [...new Map(lines.filter((l) => l.item.tracking !== "none").map((l) => [l.itemId, l.item])).values()];
  const progress = lines.length ? Math.round((counted.length / lines.length) * 100) : 0;

  return (
    <>
      <PageHeader
        back={{ href: "/counts", label: "Инвентаризация" }}
        title={count.number}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CountStatusBadge status={count.status} />
            <span>
              {count.location.name}
              {count.category && ` · ${count.category.name}`} · започната {formatDateTime(count.createdAt)}
              {count.createdBy && ` от ${count.createdBy}`}
            </span>
          </span>
        }
        actions={
          <a href={`/print/counts/${id}${open ? "?blind=1" : ""}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
            <Printer className="h-4 w-4" />
            {open ? "Лист за броене" : "Протокол"} (PDF)
          </a>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Преброени</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {counted.length} / {lines.length}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Редове с разлика</div>
          <div className={cn("mt-1 text-xl font-semibold tabular-nums", diffs.length > 0 && "text-warning")}>{diffs.length}</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Разлика в стойността</div>
          <div className={cn("mt-1 text-xl font-semibold tabular-nums", valueDelta < 0 ? "text-danger" : valueDelta > 0 ? "text-success" : "")}>
            {valueDelta > 0 ? "+" : ""}
            {money(valueDelta)}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {writable && (
            <Card>
              <CardHeader title="Броене със скенер" description="USB скенер, камера на телефона или ръчно въведен код." />
              <CardBody>
                <CountScanner action={scanCount.bind(null, id)} />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Артикули"
              actions={
                <div className="flex gap-1">
                  {(Object.keys(SHOW) as Array<keyof typeof SHOW>).map((k) => (
                    <Link key={k} href={k === "all" ? `/counts/${id}` : `/counts/${id}?show=${k}`} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", show === k ? "bg-accent-soft text-accent" : "text-muted hover:text-text")}>
                      {SHOW[k]}
                    </Link>
                  ))}
                </div>
              }
            />
            <Form action={saveCounts.bind(null, id)} resetOnSuccess={false}>
              <Table>
                <thead>
                  <tr>
                    <th>Артикул</th>
                    <th>Партида / сер. №</th>
                    <th className="text-right">Очаквано</th>
                    <th className="text-right">Преброено</th>
                    <th className="text-right">Разлика</th>
                    <th className="text-right">Стойност</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => {
                    const delta = l.counted === null ? null : l.counted - l.expected;
                    return (
                      <tr key={l.id}>
                        <td>
                          <Link href={`/items/${l.itemId}`} className="font-medium hover:text-accent">
                            {l.item.name}
                            {l.item.variantLabel && <span className="text-muted"> · {l.item.variantLabel}</span>}
                          </Link>
                          <div className="font-mono text-xs text-muted">
                            {l.item.sku}
                            {l.item.barcode && <span className="ml-2">▮ {l.item.barcode}</span>}
                          </div>
                        </td>
                        <td className="font-mono text-xs">{l.lotNumber ?? <span className="text-muted">—</span>}</td>
                        <td className="text-right tabular-nums text-muted">
                          {formatNumber(l.expected)} {l.item.unit}
                        </td>
                        <td className="text-right">
                          {writable ? (
                            <Input name={`counted_${l.id}`} type="number" min={0} step={quantityStep(itemDecimals(l.item))} max={l.item.tracking === "serial" ? 1 : undefined} defaultValue={l.counted ?? ""} placeholder="—" className="ml-auto w-24 text-right tabular-nums" aria-label={`Преброено: ${l.item.name}`} />
                          ) : (
                            <span className="tabular-nums">{l.counted ?? "—"}</span>
                          )}
                        </td>
                        <td className={cn("text-right font-medium tabular-nums", delta === null ? "text-muted" : delta < 0 ? "text-danger" : delta > 0 ? "text-success" : "text-muted")}>
                          {delta === null ? "" : delta > 0 ? `+${formatNumber(delta)}` : formatNumber(delta)}
                        </td>
                        <td className="text-right text-xs tabular-nums text-muted">{delta ? money(lineTotal(delta, l.item.unitCost)) : ""}</td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted">
                        Няма редове в този изглед.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
              {writable && shown.length > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
                  <span className="text-xs text-muted">Празно поле = още не е преброено.</span>
                  <SubmitButton variant="secondary">
                    <Save className="h-4 w-4" />
                    Запази количествата
                  </SubmitButton>
                </div>
              )}
            </Form>
          </Card>
        </div>

        <div className="space-y-6">
          {canApply && (
            <Card>
              <CardHeader title="Приключване" description="Разликите се записват като складови движения „Инвентаризация“ в една транзакция." />
              <CardBody>
                <Form action={applyCount.bind(null, id)} className="space-y-3">
                  <p className="text-sm">
                    {diffs.length ? (
                      <>
                        Ще бъдат направени <strong>{diffs.length}</strong> корекции ({valueDelta > 0 ? "+" : ""}
                        {money(valueDelta)}).
                      </>
                    ) : (
                      "Няма разлики между очаквано и преброено."
                    )}
                  </p>
                  {counted.length < lines.length && (
                    <>
                      <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">{lines.length - counted.length} реда не са преброени — по подразбиране наличността им не се променя.</p>
                      <Checkbox name="uncountedAsZero" label="Неброените да се считат за 0" />
                    </>
                  )}
                  <ConfirmButton className="w-full" message={`Да приложа ли ${count.number}? Наличността в „${count.location.name}“ ще бъде коригирана.`}>
                    <Check className="h-4 w-4" />
                    Приложи разликите
                  </ConfirmButton>
                </Form>
              </CardBody>
            </Card>
          )}
          {open && !canApply && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">Разликите се прилагат от мениджър или администратор.</p>}

          {writable && tracked.length > 0 && (
            <Card>
              <CardHeader title="Нова партида" description="Намерена партида или сериен номер, които не са в списъка." />
              <CardBody>
                <Form action={addCountLot.bind(null, id)} className="space-y-3">
                  <Field label="Артикул">
                    <Select name="itemId" required>
                      {tracked.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                          {i.variantLabel ? ` · ${i.variantLabel}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-[1fr_5rem] gap-3">
                    <Field label="Партида / сер. №">
                      <Input name="lotNumber" required className="font-mono" />
                    </Field>
                    <Field label="К-во">
                      <Input name="quantity" type="number" min={0} step="any" defaultValue={1} />
                    </Field>
                  </div>
                  <SubmitButton variant="secondary" className="w-full">
                    Добави
                  </SubmitButton>
                </Form>
              </CardBody>
            </Card>
          )}

          {writable && (
            <Form action={cancelCount.bind(null, id)}>
              <ConfirmButton variant="ghost" className="w-full" message="Да откажа ли инвентаризацията? Наличността няма да се промени.">
                <X className="h-4 w-4" />
                Откажи инвентаризацията
              </ConfirmButton>
            </Form>
          )}

          {count.status === "applied" && (
            <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
              Приложена {formatDateTime(count.appliedAt)}
              {count.appliedBy && ` от ${count.appliedBy}`}.{" "}
              <Link href={`/movements?q=${encodeURIComponent(count.number)}`} className="font-medium underline">
                Виж движенията
              </Link>
            </p>
          )}
          {count.notes && <p className="text-sm text-muted">Бележка: {count.notes}</p>}
        </div>
      </div>
    </>
  );
}
