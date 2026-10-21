import type { Metadata } from "next";
import { OrderForm } from "@/components/orders/order-form";
import { PageHeader } from "@/components/ui/page-header";
import { createOrder } from "@/lib/actions/orders";
import { requireContext } from "@/lib/auth";
import { peekNumber } from "@/lib/numbering";
import { listItemOptions, listLocations, listPartners, listVatRates } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Нова поръчка" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ type?: string; item?: string }> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  const type = sp.type === "sales" ? "sales" : "purchase";
  const [items, locations, partnersList, number, vatRates, settings] = await Promise.all([listItemOptions(ctx.db), listLocations(ctx.db), listPartners(ctx.db), peekNumber(ctx.db, type), listVatRates(ctx.db), getSettings(ctx.db)]);
  const itemId = Number(sp.item);
  const initialLines = Number.isInteger(itemId) && itemId > 0 ? [{ itemId, quantity: 1 }] : undefined;
  const partners = await Promise.all(partnersList.map(async (p) => ({ id: p.id, name: p.name, type: p.type, leadTimeDays: p.leadTimeDays })));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Нова поръчка" back={{ href: "/orders", label: "Поръчки" }} />
      <OrderForm items={items} locations={locations} partners={partners} initialType={type} initialLines={initialLines} numberPlaceholder={number} vatRates={vatRates} pricesIncludeVat={settings.pricesIncludeVat} action={createOrder} cancelHref="/orders" />
    </div>
  );
}
