import type { Metadata } from "next";
import { TransferForm } from "@/components/transfers/transfer-form";
import { PageHeader } from "@/components/ui/page-header";
import { saveTransferAction } from "@/lib/actions/transfers";
import { requireContext } from "@/lib/auth";
import { listLocationsFor } from "@/lib/queries";
import { transferFormData } from "@/lib/transfers";

export const metadata: Metadata = { title: "Нов трансфер" };

export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireContext("write");
  const sp = await searchParams;
  const [data, locations] = await Promise.all([transferFormData(ctx.db), listLocationsFor(ctx)]);
  const from = Number(sp.from) || null;
  const to = Number(sp.to) || null;
  const initial = from || to ? { fromLocationId: from ?? locations[0]?.id ?? 0, toLocationId: to ?? locations.find((l) => l.id !== from)?.id ?? 0, notes: null, lines: [] } : undefined;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader help="transfers" title="Нов трансфер" back={{ href: "/transfers", label: "Трансфери" }} />
      {locations.length < 2 ? (
        <p className="rounded-lg border border-line bg-surface p-5 text-sm text-muted">За трансфер са нужни поне две локации, до които имате достъп. Добавете ги от Настройки › Локации.</p>
      ) : (
        <TransferForm {...data} locations={locations} initial={initial} action={saveTransferAction.bind(null, null)} cancelHref="/transfers" />
      )}
    </div>
  );
}
