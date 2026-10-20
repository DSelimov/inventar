import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { items, lots } from "@/db/schema";
import { ApiError, handler, json, paramId, readJson } from "@/lib/api";
import { emit } from "@/lib/webhooks";

type Params = { params: Promise<{ id: string }> };

export const GET = handler("read", async (_req, ctx, { params }: Params) => {
  const id = await paramId(params);
  const row = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.organizationId, ctx.orgId)),
    with: { category: true, stockLevels: { with: { location: true } }, lots: { where: gt(lots.quantity, 0), with: { location: true } }, fieldValues: { with: { field: true } }, variants: true },
  });
  if (!row) throw new ApiError(404, "Артикулът не е намерен.");
  return json({ data: row });
});

const EDITABLE = ["name", "barcode", "description", "categoryId", "unit", "unitCost", "unitPrice", "minQuantity", "status", "sku"] as const;

export const PATCH = handler("write", async (req, ctx, { params }: Params) => {
  const id = await paramId(params);
  const existing = await db.query.items.findFirst({ where: and(eq(items.id, id), eq(items.organizationId, ctx.orgId)) });
  if (!existing) throw new ApiError(404, "Артикулът не е намерен.");
  const body = await readJson<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) patch[k] = body[k];
  if (!Object.keys(patch).length) throw new ApiError(422, "Няма полета за промяна.");
  const [row] = await db.update(items).set({ ...patch, updatedAt: new Date() }).where(eq(items.id, id)).returning();
  emit(ctx.orgId, "item.updated", { id, ...patch, source: "api" });
  return json({ data: row });
});
