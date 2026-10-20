"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  SHIPMENT_DIRECTIONS,
  SHIPMENT_STATUSES,
  shipmentLines,
  shipments,
  type ShipmentStatus,
} from "@/db/schema";
import { oneOf, optional, required, str } from "@/lib/forms";
import { applyMovement } from "./items";

function revalidate(id?: number) {
  revalidatePath("/");
  revalidatePath("/shipments");
  revalidatePath("/calendar");
  if (id) revalidatePath(`/shipments/${id}`);
}

type LineInput = { itemId: number; quantity: number };

function readLines(fd: FormData): LineInput[] {
  const ids = fd.getAll("lineItemId").map(String);
  const qtys = fd.getAll("lineQuantity").map(String);
  const lines: LineInput[] = [];
  ids.forEach((id, i) => {
    const itemId = Number(id);
    const quantity = Math.trunc(Number(qtys[i] ?? 0));
    if (Number.isInteger(itemId) && itemId > 0 && quantity > 0) lines.push({ itemId, quantity });
  });
  // merge duplicates
  const merged = new Map<number, number>();
  for (const l of lines) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.quantity);
  return [...merged].map(([itemId, quantity]) => ({ itemId, quantity }));
}

function readShipment(fd: FormData) {
  return {
    reference: required(str(fd, "reference"), "Референция"),
    direction: oneOf(fd, "direction", SHIPMENT_DIRECTIONS, "inbound"),
    partner: optional(fd, "partner"),
    carrier: optional(fd, "carrier"),
    trackingNumber: optional(fd, "trackingNumber"),
    expectedDate: optional(fd, "expectedDate"),
    notes: optional(fd, "notes"),
  };
}

export async function createShipment(fd: FormData) {
  const data = readShipment(fd);
  const lines = readLines(fd);
  if (!lines.length) throw new Error("Добавете поне един ред към пратката.");
  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(shipments).values(data).returning({ id: shipments.id });
    await tx.insert(shipmentLines).values(lines.map((l) => ({ ...l, shipmentId: row.id })));
    return row.id;
  });
  revalidate(id);
  redirect(`/shipments/${id}`);
}

export async function updateShipment(id: number, fd: FormData) {
  const existing = await db.query.shipments.findFirst({ where: eq(shipments.id, id) });
  if (!existing) throw new Error("Пратката не е намерена.");
  const data = readShipment(fd);
  const lines = readLines(fd);
  if (!lines.length) throw new Error("Добавете поне един ред към пратката.");
  const editable = existing.status === "pending" || existing.status === "in_transit";
  await db.transaction(async (tx) => {
    await tx.update(shipments).set(data).where(eq(shipments.id, id));
    if (editable) {
      await tx.delete(shipmentLines).where(eq(shipmentLines.shipmentId, id));
      await tx.insert(shipmentLines).values(lines.map((l) => ({ ...l, shipmentId: id })));
    }
  });
  revalidate(id);
  redirect(`/shipments/${id}`);
}

export async function setShipmentStatus(id: number, status: ShipmentStatus) {
  if (!SHIPMENT_STATUSES.includes(status)) throw new Error("Непознат статус.");
  const shipment = await db.query.shipments.findFirst({
    where: eq(shipments.id, id),
    with: { lines: true },
  });
  if (!shipment) throw new Error("Пратката не е намерена.");
  if (shipment.status === "delivered" || shipment.status === "cancelled") {
    throw new Error("Доставена или отказана пратка не може да сменя статуса си.");
  }

  await db.transaction(async (tx) => {
    if (status === "delivered") {
      const type = shipment.direction === "inbound" ? "in" : "out";
      for (const line of shipment.lines) {
        await applyMovement(line.itemId, type, line.quantity, `Пратка ${shipment.reference}`, id, tx);
      }
    }
    await tx
      .update(shipments)
      .set({ status, deliveredAt: status === "delivered" ? new Date().toISOString() : null })
      .where(eq(shipments.id, id));
  });

  revalidate(id);
  revalidatePath("/items");
}

export async function deleteShipment(id: number) {
  await db.delete(shipments).where(eq(shipments.id, id));
  revalidate();
  redirect("/shipments");
}
