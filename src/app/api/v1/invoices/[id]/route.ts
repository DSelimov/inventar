import { ApiError, handler, json, paramId } from "@/lib/api";
import { getInvoice } from "@/lib/queries";

export const GET = handler("read", async (_req, ctx, { params }: { params: Promise<{ id: string }> }) => {
  const row = await getInvoice(ctx.db, await paramId(params));
  if (!row) throw new ApiError(404, "Документът не е намерен.");
  return json({ data: row });
});
