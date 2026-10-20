import { SHIPMENT_STATUSES, type ShipmentStatus } from "@/db/tenant-schema";
import { ApiError, handler, json, paramId, readJson } from "@/lib/api";
import { changeShipmentStatus } from "@/lib/shipment-service";

export const POST = handler("write", async (req, ctx, { params }: { params: Promise<{ id: string }> }) => {
  const id = await paramId(params);
  const { status } = await readJson<{ status: string }>(req);
  if (!(SHIPMENT_STATUSES as readonly string[]).includes(status) || status === "pending") throw new ApiError(422, "status трябва да е in_transit, delivered или cancelled.");
  const shipment = await changeShipmentStatus(ctx.db, null, id, status as ShipmentStatus);
  return json({ data: { id, reference: shipment.reference, status } });
});
