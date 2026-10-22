import { NextResponse } from "next/server";
import { requireContext } from "@/lib/auth";
import { waybillLabel } from "@/lib/integrations/waybills";
import { pdfBytesResponse } from "@/lib/pdf";

/** Етикет на товарителницата: адресът на куриера (Еконт) или PDF, изтеглен с нашия достъп (Спиди, BOX NOW). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("read");
  const r = await waybillLabel(ctx.db, Number((await params).id));
  if ("url" in r && r.url) return NextResponse.redirect(r.url);
  return pdfBytesResponse(r.pdf!, `etiket-${(await params).id}.pdf`);
}
