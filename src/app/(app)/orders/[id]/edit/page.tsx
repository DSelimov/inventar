import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OrderForm } from "@/components/orders/order-form";
import { PageHeader } from "@/components/ui/page-header";
import { updateOrder } from "@/lib/actions/orders";
import { requireContext } from "@/lib/auth";
import { listCurrencies } from "@/lib/fx";
import { getOrder, listAllItemUnits, listGroupPrices, listItemOptions, listLocationsFor, listPartners, listPriceGroups, listSupplierPrices, listVatRates } from "@/lib/queries";

export const metadata: Metadata = { title: "Редакция на поръчка" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("write");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [order, items, locations, partnersList, vatRates, supplierPrices] = await Promise.all([getOrder(ctx.db, id), listItemOptions(ctx.db), listLocationsFor(ctx), listPartners(ctx.db), listVatRates(ctx.db), listSupplierPrices(ctx.db)]);
  const [packUnits, groupPrices, priceGroups, currencies] = await Promise.all([listAllItemUnits(ctx.db), listGroupPrices(ctx.db), listPriceGroups(ctx.db, true), listCurrencies(ctx.db)]);
  const priceGroupNames = Object.fromEntries(priceGroups.map((g) => [g.id, g.name]));
  if (!order) notFound();
  if (order.status !== "draft" && order.status !== "quote") redirect(`/orders/${id}`);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Редакция: ${order.number}`} back={{ href: `/orders/${id}`, label: order.number }} />
      <OrderForm currencies={currencies} baseCurrency={ctx.org.currency} packUnits={packUnits} groupPrices={groupPrices} priceGroupNames={priceGroupNames}
        items={items}
        locations={locations}
        partners={partnersList.map((p) => ({ id: p.id, name: p.name, type: p.type, leadTimeDays: p.leadTimeDays, priceGroupId: p.priceGroupId, discountPercent: p.discountPercent }))}
        order={order}
        initialLines={order.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice, vatRateId: l.vatRateId }))}
        numberPlaceholder={order.number}
        vatRates={vatRates}
        pricesIncludeVat={order.pricesIncludeVat}
        supplierPrices={supplierPrices}
        action={updateOrder.bind(null, id)}
        cancelHref={`/orders/${id}`}
      />
    </div>
  );
}
