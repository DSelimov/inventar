"use server";

import { revalidatePath } from "next/cache";
import { CONSIGNMENT_KINDS } from "@/db/tenant-schema";
import { act, redirectWith } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { runConsignment } from "@/lib/consignment";
import { UserError } from "@/lib/errors";
import { int, oneOf, optional, optionalInt } from "@/lib/forms";
import { parseMoney } from "@/lib/money";
import { parseQuantity } from "@/lib/quantity";
import { assertLocationAccess } from "@/lib/stock";

export const runConsignmentAction = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const kind = oneOf(fd, "kind", CONSIGNMENT_KINDS, "give");
  const partnerId = int(fd, "partnerId");
  if (!partnerId) throw new UserError("Изберете партньор.");
  const warehouseId = optionalInt(fd, "warehouseId");
  assertLocationAccess(ctx.user, warehouseId);
  const ids = fd.getAll("lineItemId").map(Number);
  const qtys = fd.getAll("lineQuantity").map(String);
  const prices = fd.getAll("linePrice").map(String);
  const lines = ids
    .map((itemId, i) => ({ itemId, quantity: parseQuantity(qtys[i], 3, `Ред ${i + 1}: количество`), unitPrice: kind === "report" ? parseMoney(prices[i], `Ред ${i + 1}: цена`, null) : null }))
    .filter((l) => Number.isInteger(l.itemId) && l.itemId > 0 && l.quantity > 0);
  const r = await runConsignment(ctx.db, ctx.user, { kind, partnerId, warehouseId, lines, notes: optional(fd, "notes") });
  await audit(ctx, "create", "consignment", r.id, { number: r.number, kind, partnerId, lines: lines.length });
  revalidatePath("/consignments");
  revalidatePath(`/partners/${partnerId}`);
  return redirectWith(`/consignments/${r.id}`, `Записан е ${r.number}.`);
});
