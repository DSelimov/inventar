import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReceiveForm } from "@/components/shipments/receive-form";
import { PageHeader } from "@/components/ui/page-header";
import { receiveShipmentAction } from "@/lib/actions/receiving";
import { requireContext } from "@/lib/auth";
import { receivingData } from "@/lib/receiving";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Приемане със скенер" };

export default async function ReceiveShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("write");
  const id = Number((await params).id);
  const data = await receivingData(ctx.db, id);
  if (!data) notFound();
  const { shipment } = data;
  if (shipment.direction !== "inbound" || shipment.status === "delivered" || shipment.status === "cancelled") redirect(`/shipments/${id}`);
  const partner = shipment.partnerRecord?.name ?? shipment.partner;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        help="receiving"
        title={`Приемане: ${shipment.reference}`}
        back={{ href: `/shipments/${id}`, label: shipment.reference }}
        description={[partner, shipment.location ? `в „${shipment.location.name}“` : null, shipment.order ? `по поръчка ${shipment.order.number}` : null, shipment.expectedDate ? `очаквана ${formatDate(shipment.expectedDate)}` : null]
          .filter(Boolean)
          .join(" · ")}
      />
      <ReceiveForm shipmentId={id} expected={data.lines} items={data.items} units={data.units} action={receiveShipmentAction.bind(null, id)} cancelHref={`/shipments/${id}`} />
    </div>
  );
}
