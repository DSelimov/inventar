"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { int, optional, str } from "@/lib/forms";
import { formatMoney } from "@/lib/utils";
import { MAX_DECIMALS, parseQuantity } from "@/lib/quantity";
import { applyWriteOff, cancelWriteOff, createWriteOff } from "@/lib/write-offs";
import { act, redirectWith } from "@/lib/action";
import { UserError } from "@/lib/errors";

function revalidate(id?: number) {
  revalidatePath("/write-offs");
  revalidatePath("/items");
  revalidatePath("/movements");
  if (id) revalidatePath(`/write-offs/${id}`);
}

export const createWriteOffAction = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const locationId = int(fd, "locationId", 0);
  if (!locationId) throw new UserError("Изберете локация.");
  const ids = fd.getAll("lineItemId").map(String);
  const qtys = fd.getAll("lineQuantity").map(String);
  const lotIds = fd.getAll("lineLotId").map(String);
  const lines = ids
    .map((id, i) => ({ itemId: Number(id), lotId: Number(lotIds[i]) > 0 ? Number(lotIds[i]) : null, quantity: parseQuantity(qtys[i], MAX_DECIMALS, `Ред ${i + 1}: количество`) }))
    .filter((l) => Number.isInteger(l.itemId) && l.itemId > 0);
  const r = await createWriteOff(ctx.db, { locationId, reason: str(fd, "reason"), commission: optional(fd, "commission"), notes: optional(fd, "notes"), lines }, ctx.user.name);
  await audit(ctx, "create", "write_off", r.id, { number: r.number, lines: lines.length });
  revalidate(r.id);
  return redirectWith(`/write-offs/${r.id}`, `Протокол ${r.number} е създаден като чернова.`);
});

/** Изписването е действие на мениджър: намалява наличността и стойността на склада. */
export const applyWriteOffAction = act(async (id: number) => {
  const ctx = await requireContext("delete");
  const r = await applyWriteOff(ctx.db, id, ctx.user);
  await audit(ctx, "status", "write_off", id, { number: r.number, status: "applied", value: r.value });
  revalidate(id);
  return `${r.number} е приложен: изписани ${r.lines} реда за ${formatMoney(r.value, ctx.org.currency)}.`;
});

export const cancelWriteOffAction = act(async (id: number) => {
  const ctx = await requireContext("write");
  await cancelWriteOff(ctx.db, id);
  await audit(ctx, "status", "write_off", id, { status: "cancelled" });
  revalidate(id);
  return "Протоколът е отказан.";
});
