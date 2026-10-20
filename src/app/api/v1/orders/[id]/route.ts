import { ApiError, handler, json, paramId } from "@/lib/api";
import { getOrder } from "@/lib/queries";

export const GET = handler("read", async (_req, ctx, { params }: { params: Promise<{ id: string }> }) => {
  const row = await getOrder(ctx.orgId, await paramId(params));
  if (!row) throw new ApiError(404, "Поръчката не е намерена.");
  return json({ data: row });
});
