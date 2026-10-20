import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShipmentForm } from "@/components/shipments/shipment-form";
import { PageHeader } from "@/components/ui/page-header";
import { updateShipment } from "@/lib/actions/shipments";
import { requireContext } from "@/lib/auth";
import { getShipment, listAvailableLots, listItemOptions, listLocations, listPartners } from "@/lib/queries";

export const metadata: Metadata = { title: "Редакция на пратка" };

export default async function EditShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("write");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [shipment, items, locations, partners, lots] = await Promise.all([
    getShipment(ctx.org.id, id),
    listItemOptions(ctx.org.id),
    listLocations(ctx.org.id),
    listPartners(ctx.org.id),
    listAvailableLots(ctx.org.id),
  ]);
  if (!shipment) notFound();
  const editable = shipment.status === "pending" || shipment.status === "in_transit";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Редакция: ${shipment.reference}`} back={{ href: `/shipments/${id}`, label: shipment.reference }} description={shipment.order ? `Пратка по поръчка ${shipment.order.number}. Допълнете партиди/серийни номера, ако е нужно.` : undefined} />
      <ShipmentForm
        items={items}
        locations={locations}
        partners={partners}
        lots={lots}
        shipment={shipment}
        orderId={shipment.orderId}
        initialLines={shipment.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, lotNumber: l.lotNumber, expiryDate: l.expiryDate, lotId: l.lotId }))}
        linesEditable={editable}
        action={updateShipment.bind(null, id)}
        cancelHref={`/shipments/${id}`}
      />
    </div>
  );
}
