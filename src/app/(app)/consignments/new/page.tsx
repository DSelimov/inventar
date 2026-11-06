import type { Metadata } from "next";
import { and, eq, gt, inArray } from "drizzle-orm";
import { ConsignmentForm, type ConsignmentItemOption } from "@/components/consignment/consignment-form";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { itemPrices, items, stockLevels } from "@/db/tenant-schema";
import { runConsignmentAction } from "@/lib/actions/consignment";
import { requireContext } from "@/lib/auth";
import { CONSIGNMENT_LABELS, consignmentStock } from "@/lib/consignment";
import { param, type SearchParams } from "@/lib/paging";
import { salesPrice } from "@/lib/pricing";
import { listLocationsFor, listPartners } from "@/lib/queries";

export const metadata: Metadata = { title: "Консигнация" };

export default async function NewConsignmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  const kind = (["give", "report", "return"] as const).find((k) => k === param(sp, "kind")) ?? "give";
  const partnerId = Number(param(sp, "partner")) || null;
  const [partners, allLocations] = await Promise.all([listPartners(ctx.db), listLocationsFor(ctx)]);
  const warehouses = allLocations.filter((l) => !l.partnerId);
  const partner = partners.find((p) => p.id === partnerId);

  let options: ConsignmentItemOption[] = [];
  if (partner && kind === "give") {
    const wh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
    const rows = wh
      ? await ctx.db
          .select({ id: items.id, name: items.name, sku: items.sku, unit: items.unit, quantityDecimals: items.quantityDecimals, tracking: items.tracking, available: stockLevels.quantity })
          .from(stockLevels)
          .innerJoin(items, eq(items.id, stockLevels.itemId))
          .where(and(eq(stockLevels.locationId, wh.id), gt(stockLevels.quantity, 0), eq(items.tracking, "none"), eq(items.status, "active")))
          .orderBy(items.name)
      : [];
    options = rows;
  } else if (partner) {
    const stock = await consignmentStock(ctx.db, partner.id);
    const meta = stock.length ? await ctx.db.select().from(items).where(inArray(items.id, stock.map((s) => s.itemId))) : [];
    const groupPrices = partner.priceGroupId && stock.length ? await ctx.db.select().from(itemPrices).where(and(eq(itemPrices.priceGroupId, partner.priceGroupId), inArray(itemPrices.itemId, stock.map((s) => s.itemId)))) : [];
    options = stock.map((s) => {
      const it = meta.find((m) => m.id === s.itemId)!;
      return {
        id: s.itemId,
        name: s.name,
        sku: s.sku,
        unit: s.unit,
        quantityDecimals: it.quantityDecimals,
        tracking: it.tracking,
        available: s.quantity,
        price: kind === "report" ? salesPrice({ retail: it.unitPrice, groupPrice: groupPrices.find((g) => g.itemId === s.itemId)?.price ?? null, discountPercent: partner.discountPercent }) : undefined,
      };
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={partner ? `${CONSIGNMENT_LABELS[kind]} — ${partner.name}` : "Консигнация"} back={{ href: "/consignments", label: "Консигнация" }} />
      <Card>
        <CardBody>
          <form action="/consignments/new" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Партньор">
              <Select name="partner" defaultValue={partnerId ?? ""} required>
                <option value="" disabled>
                  Изберете…
                </option>
                {partners
                  .filter((p) => p.type !== "supplier")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Операция">
              <Select name="kind" defaultValue={kind}>
                {(["give", "report", "return"] as const).map((k) => (
                  <option key={k} value={k}>
                    {CONSIGNMENT_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton variant="secondary">Продължи</SubmitButton>
          </form>
        </CardBody>
      </Card>
      {partner && <ConsignmentForm key={`${partner.id}-${kind}`} kind={kind} partnerId={partner.id} warehouses={warehouses} items={options} action={runConsignmentAction} cancelHref="/consignments" />}
    </div>
  );
}
