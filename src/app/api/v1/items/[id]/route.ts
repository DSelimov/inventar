import { eq, gt } from "drizzle-orm";
import { items, lots } from "@/db/tenant-schema";
import { ApiError, handler, json, paramId, readJson } from "@/lib/api";
import { emit } from "@/lib/webhooks";

type Params = { params: Promise<{ id: string }> };

export const GET = handler("read", async (_req, ctx, { params }: Params) => {
  const id = await paramId(params);
  const row = await ctx.db.query.items.findFirst({
    where: eq(items.id, id),
    with: { category: true, stockLevels: { with: { location: true } }, lots: { where: gt(lots.quantity, 0), with: { location: true } }, fieldValues: { with: { field: true } }, variants: true },
  });
  if (!row) throw new ApiError(404, "Артикулът не е намерен.");
  return json({ data: row });
});

const EDITABLE = ["name", "barcode", "description", "categoryId", "unit", "unitCost", "unitPrice", "minQuantity", "status", "sku"] as const;

export const PATCH = handler("write", async (req, ctx, { params }: Params) => {
  const id = await paramId(params);
  const existing = await ctx.db.query.items.findFirst({ where: eq(items.id, id) });
  if (!existing) throw new ApiError(404, "Артикулът не е намерен.");
  const body = await readJson<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) patch[k] = body[k];
  if (!Object.keys(patch).length) throw new ApiError(422, "Няма полета за промяна.");
  await ctx.db.update(items).set({ ...patch, updatedAt: new Date() }).where(eq(items.id, id));
  const row = await ctx.db.query.items.findFirst({ where: eq(items.id, id) });
  emit(ctx.db, "item.updated", { id, ...patch, source: "api" });
  return json({ data: row });
});
