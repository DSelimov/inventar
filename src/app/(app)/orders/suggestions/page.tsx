import Link from "next/link";
import type { Metadata } from "next";
import { PackageCheck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { createReplenishmentOrders } from "@/lib/actions/replenishment";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { itemDecimals, quantityStep } from "@/lib/quantity";
import { replenishmentSuggestions } from "@/lib/replenishment";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Предложения за поръчка" };

export default async function SuggestionsPage() {
  const ctx = await requireContext();
  const [groups, s] = await Promise.all([replenishmentSuggestions(ctx.db), getSettings(ctx.db)]);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const writable = can(ctx.role, "write");
  let index = 0;

  return (
    <>
      <PageHeader help="orders"
        title="Предложения за поръчка"
        description={`Продажбите за последните ${s.windowDays} дни × (срок на доставка + ${s.safetyDays} дни буфер) + минимум − наличност − очаквано. Срокът и цената са от предпочитания доставчик на артикула.`}
        back={{ href: "/orders", label: "Поръчки" }}
      />
      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={PackageCheck} title="Няма нужда от поръчка" description="Наличностите и очакваните доставки покриват продажбите за срока на доставка." />
        </Card>
      ) : (
        <Form action={createReplenishmentOrders} className="space-y-6">
          {groups.map((g) => (
            <Card key={g.supplierId ?? "none"}>
              <CardHeader
                title={g.supplierName ?? "Без доставчик"}
                description={`${g.rows.length} артикула · ${money(g.total)} без ДДС${g.supplierId ? "" : " — добавете доставчик в артикула, за да се групират правилно"}`}
              />
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Артикул</th>
                      <th className="text-right">Стига за</th>
                      <th className="text-right">Наличност</th>
                      <th className="text-right">Очаквано</th>
                      <th className="text-right">Количество</th>
                      <th className="text-right">Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const i = index++;
                      return (
                        <tr key={r.item.id}>
                          <td>
                            <input type="checkbox" name="pick" value={i} defaultChecked aria-label={`Поръчай ${r.item.name}`} />
                            <input type="hidden" name={`item_${i}`} value={r.item.id} />
                            <input type="hidden" name={`supplier_${i}`} value={r.supplierId ?? ""} />
                          </td>
                          <td>
                            <Link href={`/items/${r.item.id}`} className="font-medium hover:text-accent">
                              {r.item.name}
                              {r.item.variantLabel && <span className="text-muted"> · {r.item.variantLabel}</span>}
                            </Link>
                            <div className="text-xs text-muted">
                              {r.item.sku}
                              {r.supplierSku ? ` · код при доставчика ${r.supplierSku}` : ""} · {formatNumber(Math.round(r.avgDaily * 100) / 100)} {r.item.unit}/ден · доставка {r.leadDays} дни
                            </div>
                          </td>
                          <td className={`text-right tabular-nums ${r.daysLeft !== null && r.daysLeft <= r.leadDays ? "font-medium text-danger" : "text-muted"}`}>{r.daysLeft === null ? "—" : `${r.daysLeft} дни`}</td>
                          <td className="text-right tabular-nums">{formatNumber(r.item.quantity)}</td>
                          <td className="text-right tabular-nums text-muted">{r.incoming ? formatNumber(r.incoming) : "—"}</td>
                          <td className="text-right">
                            <Input name={`qty_${i}`} type="number" min={0} step={quantityStep(itemDecimals(r.item))} defaultValue={r.quantity} className="ml-auto w-24 text-right tabular-nums" aria-label="Количество" disabled={!writable} />
                          </td>
                          <td className="text-right">
                            <Input name={`price_${i}`} type="number" min={0} step="0.0001" defaultValue={r.unitPrice} className="ml-auto w-24 text-right tabular-nums" aria-label="Цена" disabled={!writable} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </Card>
          ))}
          {writable && (
            <div className="flex justify-end">
              <SubmitButton>Създай чернови поръчки (по доставчик)</SubmitButton>
            </div>
          )}
        </Form>
      )}
    </>
  );
}
