"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { SHIPMENT_DIRECTIONS, SHIPMENT_STATUSES, shipmentLines, shipments, type ShipmentStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { oneOf, optional, optionalInt, required, str } from "@/lib/forms";
import { getDefaultLocation } from "@/lib/queries";
import { changeShipmentStatus } from "@/lib/shipment-service";
import { emit } from "@/lib/webhooks";

function revalidate(id?: number) {
  revalidatePath("/");
  revalidatePath("/shipments");
  revalidatePath("/orders");
  revalidatePath("/calendar");
  revalidatePath("/items");
  if (id) revalidatePath(`/shipments/${id}`);
}

type LineInput = { itemId: number; quantity: number; lotNumber: string | null; expiryDate: string | null; lotId: number | null };

function readLines(fd: FormData): LineInput[] {
  const ids = fd.getAll("lineItemId").map(String);
  const qtys = fd.getAll("lineQuantity").map(String);
  const lotNumbers = fd.getAll("lineLotNumber").map(String);
  const expiries = fd.getAll("lineExpiryDate").map(String);
  const lotIds = fd.getAll("lineLotId").map(String);
  const lines: LineInput[] = [];
  ids.forEach((id, i) => {
    const itemId = Number(id);
    const quantity = Math.trunc(Number(qtys[i] ?? 0));
    if (Number.isInteger(itemId) && itemId > 0 && quantity > 0) {
      lines.push({
        itemId,
        quantity,
        lotNumber: lotNumbers[i]?.trim() || null,
        expiryDate: expiries[i]?.trim() || null,
        lotId: Number(lotIds[i]) > 0 ? Number(lotIds[i]) : null,
      });
    }
  });
  return lines;
}

async function readShipment(fd: FormData, orgId: number) {
  return {
    reference: required(str(fd, "reference"), "Референция"),
    direction: oneOf(fd, "direction", SHIPMENT_DIRECTIONS, "inbound"),
    locationId: optionalInt(fd, "locationId") ?? (await getDefaultLocation(orgId))?.id ?? null,
    partnerId: optionalInt(fd, "partnerId"),
    partner: optional(fd, "partner"),
    carrier: optional(fd, "carrier"),
    trackingNumber: optional(fd, "trackingNumber"),
    expectedDate: optional(fd, "expectedDate"),
    notes: optional(fd, "notes"),
    orderId: optionalInt(fd, "orderId"),
  };
}

async function own(orgId: number, id: number) {
  const s = await db.query.shipments.findFirst({ where: and(eq(shipments.id, id), eq(shipments.organizationId, orgId)), with: { lines: true } });
  if (!s) throw new Error("Пратката не е намерена.");
  return s;
}

export async function createShipment(fd: FormData) {
  const ctx = await requireContext("write");
  const data = await readShipment(fd, ctx.org.id);
  const lines = readLines(fd);
  if (!lines.length) throw new Error("Добавете поне един ред към пратката.");
  if (!data.locationId) throw new Error("Изберете локация.");
  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(shipments).values({ ...data, organizationId: ctx.org.id, createdBy: ctx.user.id }).returning({ id: shipments.id });
    await tx.insert(shipmentLines).values(lines.map((l) => ({ ...l, shipmentId: row.id })));
    return row.id;
  });
  await audit(ctx, "create", "shipment", id, { reference: data.reference, direction: data.direction });
  emit(ctx.org.id, "shipment.created", { id, ...data, lines });
  revalidate(id);
  redirect(`/shipments/${id}`);
}

export async function updateShipment(id: number, fd: FormData) {
  const ctx = await requireContext("write");
  const existing = await own(ctx.org.id, id);
  const data = await readShipment(fd, ctx.org.id);
  const lines = readLines(fd);
  const editable = existing.status === "pending" || existing.status === "in_transit";
  if (editable && !lines.length) throw new Error("Добавете поне един ред към пратката.");
  await db.transaction(async (tx) => {
    await tx.update(shipments).set(editable ? data : { notes: data.notes, carrier: data.carrier, trackingNumber: data.trackingNumber }).where(eq(shipments.id, id));
    if (editable) {
      await tx.delete(shipmentLines).where(eq(shipmentLines.shipmentId, id));
      await tx.insert(shipmentLines).values(lines.map((l) => ({ ...l, shipmentId: id })));
    }
  });
  await audit(ctx, "update", "shipment", id, { reference: data.reference });
  revalidate(id);
  redirect(`/shipments/${id}`);
}

export async function setShipmentStatus(id: number, status: ShipmentStatus) {
  const ctx = await requireContext("write");
  if (!SHIPMENT_STATUSES.includes(status)) throw new Error("Непознат статус.");
  const shipment = await changeShipmentStatus(ctx.org.id, ctx.user.id, id, status);
  await audit(ctx, "status", "shipment", id, { reference: shipment.reference, status });
  revalidate(id);
  if (shipment.orderId) revalidatePath(`/orders/${shipment.orderId}`);
}

export async function deleteShipment(id: number) {
  const ctx = await requireContext("delete");
  const s = await own(ctx.org.id, id);
  await db.delete(shipments).where(eq(shipments.id, id));
  await audit(ctx, "delete", "shipment", id, { reference: s.reference });
  revalidate();
  redirect("/shipments");
}
