"use server";

import { revalidatePath } from "next/cache";
import { act, redirectWith } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { parseQuantity } from "@/lib/quantity";
import { receiveShipment, type ReceivedRow } from "@/lib/receiving";

/** Приемане със скенер: rows е JSON от екрана [{ itemId, quantity, lotNumber, expiryDate, sourceLineId }]. */
export const receiveShipmentAction = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("write");
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("rows") ?? "[]"));
  } catch {
    throw new UserError("Невалидни данни от скенера — презаредете страницата.");
  }
  if (!Array.isArray(raw)) throw new UserError("Невалидни данни от скенера.");
  const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const rows: ReceivedRow[] = raw.map((r: Record<string, unknown>, i) => ({
    itemId: Number(r.itemId) || 0,
    quantity: parseQuantity(r.quantity, 3, `Ред ${i + 1}: количество`),
    lotNumber: typeof r.lotNumber === "string" ? r.lotNumber.slice(0, 2000) : null,
    expiryDate: iso(r.expiryDate),
    sourceLineId: Number(r.sourceLineId) || null,
  }));
  const r = await receiveShipment(ctx.db, ctx.user, id, rows);
  await audit(ctx, "status", "shipment", id, { reference: r.reference, status: "delivered", via: "scanner", lines: r.lines, differences: r.diffs });
  revalidatePath(`/shipments/${id}`);
  revalidatePath("/shipments");
  revalidatePath("/items");
  return redirectWith(`/shipments/${id}`, r.diffs.length ? `Пратката е приета с ${r.diffs.length} разлики — записани са в бележката.` : "Пратката е приета — наличността е обновена.");
});
