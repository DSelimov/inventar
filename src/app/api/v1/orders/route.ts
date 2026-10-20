import { ORDER_STATUSES, type OrderStatus, type OrderType } from "@/db/schema";
import { handler, json } from "@/lib/api";
import { listOrders } from "@/lib/queries";

export const GET = handler("read", async (req, ctx) => {
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type");
  const status = sp.get("status");
  const rows = await listOrders(ctx.orgId, {
    type: type === "purchase" || type === "sales" ? (type as OrderType) : "all",
    status: status && (ORDER_STATUSES as readonly string[]).includes(status) ? (status as OrderStatus) : "all",
  });
  return json({ data: rows });
});
