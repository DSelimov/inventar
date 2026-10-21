import "server-only";
import { eq } from "drizzle-orm";
import type { TenantDb } from "@/db/tenant";
import { offlineActions } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { log } from "./log";
import { recordCount } from "./stock-count";
import { applyMovement, type Actor } from "./stock";

/**
 * Синхронизация на действията от мобилния режим. Всяко действие има UUID от телефона: записът в
 * offline_actions се прави в транзакцията на самото действие (паралелно повторно изпращане чака и
 * получава грешка за дублиран ключ), а неуспехът се записва отделно — така повторно изпращане връща
 * същия резултат и нищо не се прилага два пъти.
 */
export type OfflineAction =
  | { id: string; kind: "movement"; recordedAt: string; payload: { itemId: number; locationId: number; type: "in" | "out"; quantity: number; reason?: string } }
  | { id: string; kind: "count"; recordedAt: string; payload: { countId: number; code: string; quantity: number } };

export type ActionResult = { id: string; ok: boolean; message: string; duplicate?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDuplicate(e: unknown) {
  for (let c: unknown = e; c && typeof c === "object"; c = (c as { cause?: unknown }).cause) if ((c as { code?: string }).code === "ER_DUP_ENTRY") return true;
  return false;
}

async function stored(db: TenantDb, id: string): Promise<ActionResult | null> {
  const [row] = await db.select().from(offlineActions).where(eq(offlineActions.id, id));
  return row ? { id, ok: row.ok, message: row.message ?? "", duplicate: true } : null;
}

export async function processAction(db: TenantDb, actor: Actor & { id: number }, a: OfflineAction): Promise<ActionResult> {
  if (!UUID.test(a.id)) return { id: a.id, ok: false, message: "Невалиден идентификатор на действието." };
  const previous = await stored(db, a.id);
  if (previous) return previous;
  const recordedAt = Number.isNaN(Date.parse(a.recordedAt)) ? null : new Date(a.recordedAt);
  const base = { id: a.id, kind: a.kind, payload: a.payload, userId: actor.id, recordedAt };
  try {
    const message = await db.transaction(async (tx) => {
      await tx.insert(offlineActions).values({ ...base, ok: true, message: null });
      let text: string;
      if (a.kind === "movement") {
        const p = a.payload;
        const r = await applyMovement(tx, { actor, itemId: p.itemId, locationId: p.locationId, type: p.type, quantity: p.quantity, reason: p.reason || "Мобилен режим" });
        text = `${p.type === "in" ? "Приход" : "Разход"} ${p.quantity} — наличност ${r.after}`;
      } else if (a.kind === "count") {
        const r = await recordCount(tx, a.payload.countId, a.payload.code, a.payload.quantity, "add");
        text = `${r.item.name}: преброени ${r.line.counted}`;
      } else {
        throw new UserError("Непознато действие.");
      }
      await tx.update(offlineActions).set({ message: text.slice(0, 500) }).where(eq(offlineActions.id, a.id));
      return text;
    });
    return { id: a.id, ok: true, message };
  } catch (e) {
    if (isDuplicate(e)) return (await stored(db, a.id)) ?? { id: a.id, ok: true, message: "Вече е обработено.", duplicate: true };
    const message = e instanceof UserError ? e.message : "Неочаквана грешка — действието не е приложено.";
    try {
      await db.insert(offlineActions).values({ ...base, ok: false, message: message.slice(0, 500) });
    } catch (dup) {
      if (!isDuplicate(dup)) throw dup;
    }
    if (!(e instanceof UserError)) log.error("offline.action_failed", e);
    return { id: a.id, ok: false, message };
  }
}
