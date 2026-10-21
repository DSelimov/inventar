"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { MAX_DECIMALS, parseQuantity } from "@/lib/quantity";
import { createDraftPurchaseOrders } from "@/lib/replenishment";
import { assertItemQuantities } from "@/lib/stock";
import { act, redirectWith } from "@/lib/action";
import { UserError } from "@/lib/errors";

export const createReplenishmentOrders = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const picked = fd.getAll("pick").map(String);
  if (!picked.length) throw new UserError("Изберете поне един ред.");
  const lines = picked.map((i) => ({
    itemId: Number(fd.get(`item_${i}`)),
    supplierId: Number(fd.get(`supplier_${i}`)) || null,
    quantity: parseQuantity(fd.get(`qty_${i}`), MAX_DECIMALS, "Количество"),
    unitPrice: parseMoney(fd.get(`price_${i}`), "Цена"),
  }));
  await assertItemQuantities(ctx.db, lines);
  const created = await createDraftPurchaseOrders(ctx.db, lines, ctx.user.id);
  for (const o of created) await audit(ctx, "create", "order", o.id, { number: o.number, type: "purchase", fromSuggestions: true });
  revalidatePath("/orders");
  if (created.length === 1) return redirectWith(`/orders/${created[0].id}`, `Черновата ${created[0].number} е създадена — прегледайте и потвърдете.`);
  return redirectWith("/orders?status=draft", `Създадени са ${created.length} чернови поръчки — по една на доставчик.`);
});
