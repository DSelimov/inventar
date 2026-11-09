import "server-only";
/**
 * Едно плащане от/към партньор, разпределено по неплатените му документи — най-старите първи:
 * фактури (клиент), после доставки/продажби без фактура; остатъкът е аванс.
 */
import type { Db } from "@/db/tenant";
import type { CashDirection } from "@/db/tenant-schema";
import { openDocuments, recordCashEntry } from "./cash";
import { UserError } from "./errors";
import { addPayment } from "./invoicing";
import { sumMoney } from "./money";

export type Allocation = { kind: "invoice" | "order" | "advance"; id: number | null; number: string | null; amount: number };

export async function payPartner(
  db: Db,
  actor: { id: number; name: string } | null,
  p: { partnerId: number; direction: CashDirection; amount: number; date: string; accountId?: number | null; method?: string | null; note?: string | null },
): Promise<Allocation[]> {
  if (!(p.amount > 0)) throw new UserError("Сумата трябва да е положителна.");
  return db.transaction(async (tx) => {
    const docs = await openDocuments(tx, p.partnerId, p.direction);
    const out: Allocation[] = [];
    let left = p.amount;
    for (const d of docs) {
      if (left <= 0) break;
      const amount = Math.min(left, d.open);
      if (d.kind === "invoice") {
        await addPayment(tx, d.id, { paidOn: p.date, amount, method: p.method, note: p.note, accountId: p.accountId }, actor?.name ?? "", actor);
      } else {
        await recordCashEntry(tx, actor, {
          direction: p.direction,
          entryDate: p.date,
          accountId: p.accountId,
          method: p.method,
          amount,
          partnerId: p.partnerId,
          orderId: d.id,
          category: p.direction === "in" ? "Плащане от клиент" : "Плащане към доставчик",
          note: p.note ?? `Поръчка № ${d.number}`,
        });
      }
      out.push({ kind: d.kind, id: d.id, number: d.number, amount });
      left = sumMoney([left, -amount]);
    }
    if (left > 0) {
      await recordCashEntry(tx, actor, {
        direction: p.direction,
        entryDate: p.date,
        accountId: p.accountId,
        method: p.method,
        amount: left,
        partnerId: p.partnerId,
        category: p.direction === "in" ? "Аванс от клиент" : "Аванс към доставчик",
        note: p.note,
      });
      out.push({ kind: "advance", id: null, number: null, amount: left });
    }
    return out;
  });
}
