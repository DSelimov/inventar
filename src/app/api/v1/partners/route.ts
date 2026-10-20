import { handler, json } from "@/lib/api";
import { listPartners } from "@/lib/queries";

export const GET = handler("read", async (_req, ctx) => json({ data: await listPartners(ctx.orgId) }));
