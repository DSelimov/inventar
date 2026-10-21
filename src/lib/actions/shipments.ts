"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { Db } from "@/db/tenant";
import { lots, SHIPMENT_DIRECTIONS, SHIPMENT_STATUSES, shipmentLines, shipments, type ShipmentStatus } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { oneOf, optional, optionalInt, required, str } from "@/lib/forms";
import { getDefaultLocation } from "@/lib/queries";
import { changeShipmentStatus } from "@/lib/shipment-service";
import { emit } from "@/lib/webhooks";
import { act, redirectWith } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { MAX_DECIMALS, parseQuantity } from "@/lib/quantity";
import { assertItemQuantities } from "@/lib/stock";
import { parseMoney } from "@/lib/money";

function revalidate(id?: number) {
  revalidatePath("/");
  revalidatePath("/shipments");
  revalidatePath("/orders");
  revalidatePath("/calendar");
  revalidatePath("/items");
  if (id) revalidatePath(`/shipments/${id}`);
}

type LineInput = { itemId: number; quantity: number; lotNumber: string | null; expiryDate: string | null; lotId: number | null; unitCost: number | null };

function readLines(fd: FormData): LineInput[] {
  const ids = fd.getAll("lineItemId").map(String);
  const qtys = fd.getAll("lineQuantity").map(String);
  const lotNumbers = fd.getAll("lineLotNumber").map(String);
  const expiries = fd.getAll("lineExpiryDate").map(String);
  const lotIds = fd.getAll("lineLotId").map(String);
  const costs = fd.getAll("lineUnitCost").map(String);
  const lines: LineInput[] = [];
  ids.forEach((id, i) => {
    const itemId = Number(id);
    const quantity = parseQuantity(qtys[i], MAX_DECIMALS, `Ред ${i + 1}: количество`);
    if (Number.isInteger(itemId) && itemId > 0 && quantity > 0) {
      lines.push({ itemId, quantity, lotNumber: lotNumbers[i]?.trim() || null, expiryDate: expiries[i]?.trim() || null, lotId: Number(lotIds[i]) > 0 ? Number(lotIds[i]) : null, unitCost: parseMoney(costs[i], `Ред ${i + 1}: доставна цена`, null) });
    }
  });
  return lines;
}

/** Избраната партида трябва да е на същия артикул (иначе пратката би показвала чужда партида). */
async function assertLotsBelong(db: Db, lines: LineInput[]) {
  const withLot = lines.filter((l) => l.lotId);
  if (!withLot.length) return;
  const rows = await db.select({ id: lots.id, itemId: lots.itemId }).from(lots).where(inArray(lots.id, withLot.map((l) => l.lotId!)));
  const owner = new Map(rows.map((r) => [r.id, r.itemId]));
  if (withLot.some((l) => owner.get(l.lotId!) !== l.itemId)) throw new UserError("Избраната партида не е на този артикул.");
}

async function readShipment(db: Db, fd: FormData) {
  return {
    reference: required(str(fd, "reference"), "Референция"),
    direction: oneOf(fd, "direction", SHIPMENT_DIRECTIONS, "inbound"),
    locationId: optionalInt(fd, "locationId") ?? (await getDefaultLocation(db))?.id ?? null,
    partnerId: optionalInt(fd, "partnerId"),
    partner: optional(fd, "partner"),
    carrier: optional(fd, "carrier"),
    trackingNumber: optional(fd, "trackingNumber"),
    expectedDate: optional(fd, "expectedDate"),
    notes: optional(fd, "notes"),
    orderId: optionalInt(fd, "orderId"),
  };
}

export const createShipment = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const data = await readShipment(ctx.db, fd);
  const lines = readLines(fd);
  await assertItemQuantities(ctx.db, lines);
  if (!lines.length) throw new UserError("Добавете поне един ред към пратката.");
  if (!data.locationId) throw new UserError("Изберете локация.");
  await assertLotsBelong(ctx.db, lines);
  const id = await ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(shipments).values({ ...data, createdBy: ctx.user.id }).$returningId();
    await tx.insert(shipmentLines).values(lines.map((l) => ({ ...l, shipmentId: row.id })));
    return row.id;
  });
  await audit(ctx, "create", "shipment", id, { reference: data.reference, direction: data.direction });
  emit(ctx.db, "shipment.created", { id, ...data, lines });
  revalidate(id);
  return redirectWith(`/shipments/${id}`, "Пратката е създадена.");
});

export const updateShipment = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const existing = await ctx.db.query.shipments.findFirst({ where: eq(shipments.id, id) });
  if (!existing) throw new UserError("Пратката не е намерена.");
  const data = await readShipment(ctx.db, fd);
  const lines = readLines(fd);
  await assertItemQuantities(ctx.db, lines);
  const editable = existing.status === "pending" || existing.status === "in_transit";
  if (editable && !lines.length) throw new UserError("Добавете поне един ред към пратката.");
  if (editable) await assertLotsBelong(ctx.db, lines);
  await ctx.db.transaction(async (tx) => {
    // посоката на връщане следва от поръчката и не се сменя
    const patch = existing.isReturn ? { ...data, direction: existing.direction, orderId: existing.orderId } : data;
    await tx.update(shipments).set(editable ? patch : { notes: data.notes, carrier: data.carrier, trackingNumber: data.trackingNumber }).where(eq(shipments.id, id));
    if (editable) {
      await tx.delete(shipmentLines).where(eq(shipmentLines.shipmentId, id));
      await tx.insert(shipmentLines).values(lines.map((l) => ({ ...l, shipmentId: id })));
    }
  });
  await audit(ctx, "update", "shipment", id, { reference: data.reference });
  revalidate(id);
  return redirectWith(`/shipments/${id}`, "Пратката е запазена.");
});

export const setShipmentStatus = act(async (id: number, status: ShipmentStatus) => {
  const ctx = await requireContext("write");
  if (!SHIPMENT_STATUSES.includes(status)) throw new UserError("Непознат статус.");
  const shipment = await changeShipmentStatus(ctx.db, ctx.user, id, status);
  await audit(ctx, "status", "shipment", id, { reference: shipment.reference, status });
  revalidate(id);
  if (shipment.orderId) revalidatePath(`/orders/${shipment.orderId}`);
  return "Статусът на пратката е сменен.";
});

export const deleteShipment = act(async (id: number) => {
  const ctx = await requireContext("delete");
  const s = await ctx.db.query.shipments.findFirst({ where: eq(shipments.id, id) });
  if (!s) throw new UserError("Пратката не е намерена.");
  await ctx.db.delete(shipments).where(eq(shipments.id, id));
  await audit(ctx, "delete", "shipment", id, { reference: s.reference });
  revalidate();
  return redirectWith("/shipments", "Пратката е изтрита.");
});
