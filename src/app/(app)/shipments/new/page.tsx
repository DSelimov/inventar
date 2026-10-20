import type { Metadata } from "next";
import { ShipmentForm } from "@/components/shipments/shipment-form";
import { PageHeader } from "@/components/ui/page-header";
import { createShipment } from "@/lib/actions/shipments";
import { requireContext } from "@/lib/auth";
import { listAvailableLots, listItemOptions, listLocations, listPartners } from "@/lib/queries";

export const metadata: Metadata = { title: "Нова пратка" };

export default async function NewShipmentPage({ searchParams }: { searchParams: Promise<{ direction?: string; item?: string }> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  const [items, locations, partners, lots] = await Promise.all([listItemOptions(ctx.db), listLocations(ctx.db), listPartners(ctx.db), listAvailableLots(ctx.db)]);
  const direction = sp.direction === "outbound" ? "outbound" : "inbound";
  const itemId = Number(sp.item);
  const initialLines = Number.isInteger(itemId) && itemId > 0 ? [{ itemId, quantity: 1 }] : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Нова пратка" back={{ href: "/shipments", label: "Пратки" }} />
      <ShipmentForm items={items} locations={locations} partners={partners} lots={lots} initialDirection={direction} initialLines={initialLines} action={createShipment} cancelHref="/shipments" />
    </div>
  );
}
