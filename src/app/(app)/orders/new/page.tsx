import type { Metadata } from "next";
import { OrderForm } from "@/components/orders/order-form";
import { PageHeader } from "@/components/ui/page-header";
import { createOrder } from "@/lib/actions/orders";
import { requireContext } from "@/lib/auth";
import { peekNumber } from "@/lib/numbering";
import { listAllItemUnits, listGroupPrices, listItemOptions, listItemSuppliers, listLocations, listPartners, listPriceGroups, listSupplierPrices, listVatRates } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Нова поръчка" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ type?: string; item?: string }> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  const type = sp.type === "sales" ? "sales" : "purchase";
  const [items, locations, partnersList, number, vatRates, settings, supplierPrices] = await Promise.all([listItemOptions(ctx.db), listLocations(ctx.db), listPartners(ctx.db), peekNumber(ctx.db, type), listVatRates(ctx.db), getSettings(ctx.db), listSupplierPrices(ctx.db)]);
  const [packUnits, groupPrices, priceGroups] = await Promise.all([listAllItemUnits(ctx.db), listGroupPrices(ctx.db), listPriceGroups(ctx.db, true)]);
  const priceGroupNames = Object.fromEntries(priceGroups.map((g) => [g.id, g.name]));
  const itemId = Number(sp.item);
  const initialLines = Number.isInteger(itemId) && itemId > 0 ? [{ itemId, quantity: 1 }] : undefined;
  // „Поръчай от доставчик“ от артикула: предпочитаният доставчик и неговото минимално количество
  const preferred = type === "purchase" && initialLines ? (await listItemSuppliers(ctx.db, itemId)).find((x) => x.preferred) : undefined;
  if (preferred?.minOrderQuantity && initialLines) initialLines[0].quantity = preferred.minOrderQuantity;
  const partners = await Promise.all(partnersList.map(async (p) => ({ id: p.id, name: p.name, type: p.type, leadTimeDays: p.leadTimeDays, priceGroupId: p.priceGroupId, discountPercent: p.discountPercent })));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Нова поръчка" back={{ href: "/orders", label: "Поръчки" }} />
      <OrderForm packUnits={packUnits} groupPrices={groupPrices} priceGroupNames={priceGroupNames} items={items} locations={locations} partners={partners} initialType={type} initialLines={initialLines} numberPlaceholder={number} vatRates={vatRates} pricesIncludeVat={settings.pricesIncludeVat} supplierPrices={supplierPrices} initialPartnerId={preferred?.partnerId} action={createOrder} cancelHref="/orders" />
    </div>
  );
}
