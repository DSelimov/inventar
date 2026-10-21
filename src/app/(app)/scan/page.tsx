import Link from "next/link";
import type { Metadata } from "next";
import { PackageSearch, Plus } from "lucide-react";
import { Scanner } from "@/components/scan/scanner";
import { Badge, ColorBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { adjustStock } from "@/lib/actions/items";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { findItemByCode, listLocations } from "@/lib/queries";
import { formatMoney, formatNumber, isLowStock } from "@/lib/utils";
import { Form } from "@/components/ui/form";
import { itemDecimals, quantityStep } from "@/lib/quantity";

export const metadata: Metadata = { title: "Сканиране" };

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const ctx = await requireContext();
  const { code } = await searchParams;
  const [item, locations] = await Promise.all([code ? findItemByCode(ctx.db, code) : null, listLocations(ctx.db)]);
  const writable = can(ctx.role, "write");

  return (
    <>
      <PageHeader
        title="Сканиране"
        description="Намерете артикул по баркод или код и направете бърз приход или разход."
        actions={
          <ButtonLink href="/m" variant="secondary">
            Мобилен режим (и без връзка)
          </ButtonLink>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Скенер" />
          <CardBody>
            <Scanner initialCode={code} />
          </CardBody>
        </Card>

        <div className="lg:col-span-2">
          {!code ? (
            <Card>
              <CardBody className="flex items-center gap-3 text-sm text-muted">
                <PackageSearch className="h-5 w-5" /> Сканирайте, за да видите артикула тук.
              </CardBody>
            </Card>
          ) : !item ? (
            <Card>
              <CardBody className="space-y-3">
                <p className="text-sm">
                  Няма артикул с код <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{code}</code>.
                </p>
                {writable && (
                  <ButtonLink href={`/items/new?barcode=${encodeURIComponent(code)}`}>
                    <Plus className="h-4 w-4" /> Създай артикул с този баркод
                  </ButtonLink>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title={
                  <Link href={`/items/${item.id}`} className="hover:text-accent">
                    {item.name}
                    {item.variantLabel && <span className="text-muted"> · {item.variantLabel}</span>}
                  </Link>
                }
                description={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{item.sku}</span>
                    {item.barcode && <span className="font-mono">▮ {item.barcode}</span>}
                    {item.category && <ColorBadge color={item.category.color}>{item.category.name}</ColorBadge>}
                    {isLowStock(item) && <Badge tone="danger">Ниска наличност</Badge>}
                    {item.pack && <Badge tone="accent">сканирана опаковка: {item.pack.name} = {formatNumber(item.pack.factor)} {item.unit}</Badge>}
                  </span>
                }
                actions={<ButtonLink href={`/items/${item.id}`} variant="secondary" size="sm">Отвори</ButtonLink>}
              />
              <CardBody className="grid gap-6 md:grid-cols-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted">Наличност</div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums">
                    {formatNumber(item.quantity)} <span className="text-base font-normal text-muted">{item.unit}</span>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm">
                    {item.stockLevels
                      .filter((s) => s.quantity !== 0)
                      .map((s) => (
                        <li key={s.locationId} className="flex justify-between">
                          <span className="text-muted">{s.location.name}</span>
                          <span className="tabular-nums">{formatNumber(s.quantity)}</span>
                        </li>
                      ))}
                  </ul>
                  <div className="mt-3 text-sm text-muted">
                    Продажна цена {formatMoney(item.unitPrice, ctx.org.currency)} · Доставна {formatMoney(item.unitCost, ctx.org.currency)}
                  </div>
                </div>
                {writable && item.tracking === "none" && (
                  <Form action={adjustStock.bind(null, item.id)} className="space-y-3">
                    <Field label="Локация">
                      <Select name="locationId" defaultValue={locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? ""}>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Тип">
                        <Select name="type" defaultValue="out">
                          <Option value="in">Приход (+)</Option>
                          <Option value="out">Разход (−)</Option>
                          <Option value="adjust">Точно количество</Option>
                        </Select>
                      </Field>
                      <Field label="Количество">
                        <Input name="quantity" type="number" min={0} step={quantityStep(itemDecimals(item))} defaultValue={item.pack ? item.pack.factor : 1} required />
                      </Field>
                    </div>
                    <Field label="Причина">
                      <Input name="reason" placeholder="Продажба, приемане, инвентаризация…" />
                    </Field>
                    <input type="hidden" name="redirectTo" value={`/scan?code=${encodeURIComponent(code)}`} />
                    <SubmitButton className="w-full">Приложи</SubmitButton>
                  </Form>
                )}
                {writable && item.tracking !== "none" && (
                  <p className="text-sm text-muted">Артикулът е с партиди/серийни номера. Направете движението от страницата на артикула, където избирате партида.</p>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Option(props: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option {...props} />;
}
