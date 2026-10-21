import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { WriteOffForm } from "@/components/write-offs/write-off-form";
import { createWriteOffAction } from "@/lib/actions/write-offs";
import { requireContext } from "@/lib/auth";
import { listAvailableLots, listItemOptions, listLocations } from "@/lib/queries";

export const metadata: Metadata = { title: "Нов протокол за брак" };

export default async function NewWriteOffPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const ctx = await requireContext("write");
  const [items, locations, lots] = await Promise.all([listItemOptions(ctx.db), listLocations(ctx.db), listAvailableLots(ctx.db)]);
  const itemId = Number((await searchParams).item) || undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Нов протокол за брак" description="Черновата не променя наличността; изписването е с „Приложи“." back={{ href: "/write-offs", label: "Брак" }} />
      <WriteOffForm items={items} locations={locations} lots={lots} initialItemId={itemId} action={createWriteOffAction} />
    </div>
  );
}
