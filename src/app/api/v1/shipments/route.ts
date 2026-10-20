import { handler, json } from "@/lib/api";
import { SHIPMENT_STATUSES, type ShipmentStatus } from "@/db/schema";
import { listShipments } from "@/lib/queries";

export const GET = handler("read", async (req, ctx) => {
  const status = new URL(req.url).searchParams.get("status") ?? "all";
  const rows = await listShipments(ctx.orgId, (SHIPMENT_STATUSES as readonly string[]).includes(status) ? (status as ShipmentStatus) : "all");
  return json({ data: rows });
});
