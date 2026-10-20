import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShipmentForm } from "@/components/shipments/shipment-form";
import { PageHeader } from "@/components/ui/page-header";
import { updateShipment } from "@/lib/actions/shipments";
import { getShipment, listItemOptions } from "@/lib/queries";

export const metadata: Metadata = { title: "Редакция на пратка" };

export default async function EditShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [shipment, items] = await Promise.all([getShipment(id), listItemOptions()]);
  if (!shipment) notFound();
  const editable = shipment.status === "pending" || shipment.status === "in_transit";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Редакция: ${shipment.reference}`} back={{ href: `/shipments/${id}`, label: shipment.reference }} />
      <ShipmentForm
        items={items}
        shipment={shipment}
        initialLines={shipment.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity }))}
        linesEditable={editable}
        action={updateShipment.bind(null, id)}
        cancelHref={`/shipments/${id}`}
      />
    </div>
  );
}
