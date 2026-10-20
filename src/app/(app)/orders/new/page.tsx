import type { Metadata } from "next";
import { OrderForm } from "@/components/orders/order-form";
import { PageHeader } from "@/components/ui/page-header";
import { createOrder } from "@/lib/actions/orders";
import { requireContext } from "@/lib/auth";
import { listItemOptions, listLocations, listPartners, nextOrderNumber } from "@/lib/queries";

export const metadata: Metadata = { title: "Нова поръчка" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ type?: string; item?: string }> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  const type = sp.type === "sales" ? "sales" : "purchase";
  const [items, locations, partnersList, number] = await Promise.all([listItemOptions(ctx.db), listLocations(ctx.db), listPartners(ctx.db), nextOrderNumber(ctx.db, type)]);
  const itemId = Number(sp.item);
  const initialLines = Number.isInteger(itemId) && itemId > 0 ? [{ itemId, quantity: 1 }] : undefined;
  const partners = await Promise.all(partnersList.map(async (p) => ({ id: p.id, name: p.name, type: p.type, leadTimeDays: p.leadTimeDays })));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Нова поръчка" back={{ href: "/orders", label: "Поръчки" }} />
      <OrderForm items={items} locations={locations} partners={partners} initialType={type} initialLines={initialLines} numberPlaceholder={number} action={createOrder} cancelHref="/orders" />
    </div>
  );
}
