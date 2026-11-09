"use server";

import { revalidatePath } from "next/cache";
import { act, redirectWith } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { int, optional } from "@/lib/forms";
import { parseQuantity } from "@/lib/quantity";
import { completeTransfer, deleteDraftTransfer, saveTransfer, type TransferInput } from "@/lib/transfers";

function readInput(fd: FormData): TransferInput {
  const ids = fd.getAll("lineItemId").map(Number);
  const qtys = fd.getAll("lineQuantity").map(String);
  const lotIds = fd.getAll("lineLotId").map((v) => Number(v) || null);
  return {
    fromLocationId: int(fd, "fromLocationId"),
    toLocationId: int(fd, "toLocationId"),
    notes: optional(fd, "notes"),
    lines: ids
      .map((itemId, i) => ({ itemId, quantity: parseQuantity(qtys[i], 3, `Ред ${i + 1}: количество`), lotId: lotIds[i] ?? null }))
      .filter((l) => Number.isInteger(l.itemId) && l.itemId > 0 && l.quantity > 0),
  };
}

/** Запис на чернова; с intent=complete — веднага и изпълнение. */
export const saveTransferAction = act(async (id: number | null, fd: FormData) => {
  const ctx = await requireContext("write");
  const input = readInput(fd);
  const saved = await saveTransfer(ctx.db, ctx.user, input, id ?? undefined);
  await audit(ctx, id ? "update" : "create", "transfer", saved.id, { number: saved.number, from: input.fromLocationId, to: input.toLocationId, lines: input.lines.length });
  if (fd.get("intent") === "complete") {
    const r = await completeTransfer(ctx.db, ctx.user, saved.id);
    await audit(ctx, "transfer", "transfer", saved.id, { number: r.number, lines: r.lines });
    revalidatePath("/items");
    revalidatePath("/transfers");
    return redirectWith(`/transfers/${saved.id}`, `${r.number} е изпълнен — наличността е преместена.`);
  }
  revalidatePath("/transfers");
  return redirectWith(`/transfers/${saved.id}`, `Черновата ${saved.number} е записана.`);
});

export const completeTransferAction = act(async (id: number) => {
  const ctx = await requireContext("write");
  const r = await completeTransfer(ctx.db, ctx.user, id);
  await audit(ctx, "transfer", "transfer", id, { number: r.number, lines: r.lines });
  revalidatePath("/transfers");
  revalidatePath(`/transfers/${id}`);
  revalidatePath("/items");
  return `${r.number} е изпълнен — наличността е преместена.`;
});

export const deleteTransferAction = act(async (id: number) => {
  const ctx = await requireContext("write");
  const t = await deleteDraftTransfer(ctx.db, id);
  await audit(ctx, "delete", "transfer", id, { number: t.number });
  revalidatePath("/transfers");
  return redirectWith("/transfers", `Черновата ${t.number} е изтрита.`);
});
