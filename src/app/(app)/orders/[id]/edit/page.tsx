import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OrderForm } from "@/components/orders/order-form";
import { PageHeader } from "@/components/ui/page-header";
import { updateOrder } from "@/lib/actions/orders";
import { requireContext } from "@/lib/auth";
import { getOrder, listItemOptions, listLocations, listPartners } from "@/lib/queries";

export const metadata: Metadata = { title: "Редакция на поръчка" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("write");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [order, items, locations, partnersList] = await Promise.all([getOrder(ctx.db, id), listItemOptions(ctx.db), listLocations(ctx.db), listPartners(ctx.db)]);
  if (!order) notFound();
  if (order.status !== "draft") redirect(`/orders/${id}`);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Редакция: ${order.number}`} back={{ href: `/orders/${id}`, label: order.number }} />
      <OrderForm
        items={items}
        locations={locations}
        partners={partnersList.map((p) => ({ id: p.id, name: p.name, type: p.type, leadTimeDays: p.leadTimeDays }))}
        order={order}
        initialLines={order.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice }))}
        numberPlaceholder={order.number}
        action={updateOrder.bind(null, id)}
        cancelHref={`/orders/${id}`}
      />
    </div>
  );
}
