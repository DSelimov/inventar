import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TransferForm } from "@/components/transfers/transfer-form";
import { PageHeader } from "@/components/ui/page-header";
import { saveTransferAction } from "@/lib/actions/transfers";
import { requireContext } from "@/lib/auth";
import { listLocationsFor } from "@/lib/queries";
import { getTransfer, transferFormData } from "@/lib/transfers";

export const metadata: Metadata = { title: "Редакция на трансфер" };

export default async function EditTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("write");
  const id = Number((await params).id);
  const t = await getTransfer(ctx.db, id);
  if (!t) notFound();
  if (t.status !== "draft") redirect(`/transfers/${id}`);
  const [data, locations] = await Promise.all([transferFormData(ctx.db), listLocationsFor(ctx)]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader help="transfers" title={`Трансфер ${t.number}`} back={{ href: `/transfers/${id}`, label: t.number }} />
      <TransferForm
        {...data}
        locations={locations}
        initial={{ fromLocationId: t.fromLocationId, toLocationId: t.toLocationId, notes: t.notes, lines: t.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, lotId: l.lotId })) }}
        action={saveTransferAction.bind(null, id)}
        cancelHref={`/transfers/${id}`}
      />
    </div>
  );
}
