import { handler, json } from "@/lib/api";
import { listPriceGroups } from "@/lib/queries";

export const GET = handler("read", async (_req, ctx) => {
  const rows = await listPriceGroups(ctx.db, true);
  return json({ data: rows.map((g) => ({ id: g.id, name: g.name, sortOrder: g.sortOrder, active: g.active })) });
});
