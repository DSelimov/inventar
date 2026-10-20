import { ApiError, handler, json, paramId } from "@/lib/api";
import { getShipment } from "@/lib/queries";

export const GET = handler("read", async (_req, ctx, { params }: { params: Promise<{ id: string }> }) => {
  const row = await getShipment(ctx.db, await paramId(params));
  if (!row) throw new ApiError(404, "Пратката не е намерена.");
  return json({ data: row });
});
