import { handler, json } from "@/lib/api";
import { listLocations } from "@/lib/queries";

export const GET = handler("read", async (_req, ctx) => json({ data: await listLocations(ctx.orgId, true) }));
