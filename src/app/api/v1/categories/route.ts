import { handler, json } from "@/lib/api";
import { listCategoriesWithFields } from "@/lib/queries";

export const GET = handler("read", async (_req, ctx) => json({ data: await listCategoriesWithFields(ctx.orgId) }));
