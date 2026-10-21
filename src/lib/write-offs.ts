import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { TenantDb } from "@/db/tenant";
import { items, lots, writeOffLines, writeOffs } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { sumMoney } from "./money";
import { nextNumber } from "./numbering";
import { applyMovement, assertItemQuantities, type Actor } from "./stock";

/**
 * Протокол за брак: чернова с редове → „Приложи“ изписва всеки ред с движение write_off по себестойност
 * (средна или FIFO) и записва стойността в протокола. Номерът БР-ГГГГ-NNN се заема при създаването.
 */

export type WriteOffInput = {
  locationId: number;
  reason: string;
  commission?: string | null;
  notes?: string | null;
  lines: Array<{ itemId: number; lotId: number | null; quantity: number }>;
};

export async function createWriteOff(db: TenantDb, input: WriteOffInput, createdBy: string) {
  const reason = input.reason.trim();
  if (!reason) throw new UserError("Въведете причина за брака.");
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (!lines.length) throw new UserError("Добавете поне един ред.");
  await assertItemQuantities(db, lines);

  // артикули с партиди/серийни номера: партидата е задължителна и трябва да е в локацията
  const tracked = await db.select().from(items).where(inArray(items.id, [...new Set(lines.map((l) => l.itemId))]));
  const lotIds = lines.map((l) => l.lotId).filter((id): id is number => id !== null);
  const lotRows = lotIds.length ? await db.select().from(lots).where(inArray(lots.id, lotIds)) : [];
  for (const l of lines) {
    const item = tracked.find((i) => i.id === l.itemId)!;
    if (item.tracking === "none") continue;
    const lot = lotRows.find((r) => r.id === l.lotId);
    if (!lot || lot.itemId !== item.id || lot.locationId !== input.locationId) throw new UserError(`„${item.name}“: изберете партида / сериен номер от тази локация.`);
  }

  return db.transaction(async (tx) => {
    const number = await nextNumber(tx, "writeOff");
    const [{ id }] = await tx
      .insert(writeOffs)
      .values({ number, locationId: input.locationId, reason, commission: input.commission?.trim() || null, notes: input.notes?.trim() || null, createdBy })
      .$returningId();
    await tx.insert(writeOffLines).values(lines.map((l) => ({ ...l, writeOffId: id, lotId: tracked.find((i) => i.id === l.itemId)!.tracking === "none" ? null : l.lotId })));
    return { id, number };
  });
}

export async function applyWriteOff(db: TenantDb, id: number, actor: Actor & object) {
  return db.transaction(async (tx) => {
    // заема протокола атомарно: две паралелни прилагания не изписват два пъти
    const [res] = await tx.update(writeOffs).set({ status: "applied", appliedAt: new Date(), appliedBy: actor.name }).where(and(eq(writeOffs.id, id), eq(writeOffs.status, "draft")));
    if (res.affectedRows !== 1) throw new UserError("Протоколът не е чернова (вече е приложен или отказан).");
    const [wo] = await tx.select().from(writeOffs).where(eq(writeOffs.id, id));
    const lines = await tx.select().from(writeOffLines).where(eq(writeOffLines.writeOffId, id));
    let value = 0;
    for (const l of lines) {
      const r = await applyMovement(tx, {
        actor,
        itemId: l.itemId,
        locationId: wo.locationId,
        type: "write_off",
        quantity: l.quantity,
        reason: `Брак ${wo.number}: ${wo.reason}`,
        lot: l.lotId ? { lotId: l.lotId } : null,
      });
      const lineValue = -r.value;
      value = sumMoney([value, lineValue]);
      await tx.update(writeOffLines).set({ unitCost: r.unitCost, value: lineValue }).where(eq(writeOffLines.id, l.id));
    }
    return { number: wo.number, lines: lines.length, value };
  });
}

export async function cancelWriteOff(db: TenantDb, id: number) {
  const [res] = await db.update(writeOffs).set({ status: "cancelled" }).where(and(eq(writeOffs.id, id), eq(writeOffs.status, "draft")));
  if (res.affectedRows !== 1) throw new UserError("Само чернова може да се откаже.");
}
