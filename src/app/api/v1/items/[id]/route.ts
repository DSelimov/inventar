import { eq, gt } from "drizzle-orm";
import { items, lots } from "@/db/tenant-schema";
import { ApiError, handler, json, paramId, readJson } from "@/lib/api";
import { apiImage, listItemImages } from "@/lib/item-images";
import { emit } from "@/lib/webhooks";
import { parseMoney } from "@/lib/money";
import { itemDecimals, parseQuantity, readDecimals } from "@/lib/quantity";
import { assertFitsDecimals } from "@/lib/stock";

type Params = { params: Promise<{ id: string }> };

export const GET = handler("read", async (_req, ctx, { params }: Params) => {
  const id = await paramId(params);
  const row = await ctx.db.query.items.findFirst({
    where: eq(items.id, id),
    with: { category: true, stockLevels: { with: { location: true } }, lots: { where: gt(lots.quantity, 0), with: { location: true } }, fieldValues: { with: { field: true } }, variants: true },
  });
  if (!row) throw new ApiError(404, "Артикулът не е намерен.");
  const images = (await listItemImages(ctx.db, id)).map(apiImage);
  return json({ data: { ...row, images } });
});

const EDITABLE = ["name", "barcode", "description", "categoryId", "unit", "unitCost", "unitPrice", "minQuantity", "status", "sku", "quantityDecimals"] as const;

export const PATCH = handler("write", async (req, ctx, { params }: Params) => {
  const id = await paramId(params);
  const existing = await ctx.db.query.items.findFirst({ where: eq(items.id, id) });
  if (!existing) throw new ApiError(404, "Артикулът не е намерен.");
  const body = await readJson<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) patch[k] = body[k];
  for (const k of ["unitCost", "unitPrice"] as const) if (k in patch) patch[k] = parseMoney(patch[k], k, existing[k]);
  const decimals = "quantityDecimals" in patch ? itemDecimals({ tracking: existing.tracking, quantityDecimals: readDecimals(patch.quantityDecimals) }) : existing.quantityDecimals;
  if ("quantityDecimals" in patch) {
    if (decimals < existing.quantityDecimals) await assertFitsDecimals(ctx.db, id, decimals);
    patch.quantityDecimals = decimals;
  }
  if ("minQuantity" in patch) patch.minQuantity = parseQuantity(patch.minQuantity, decimals, "minQuantity");
  if (!Object.keys(patch).length) throw new ApiError(422, "Няма полета за промяна.");
  await ctx.db.update(items).set({ ...patch, updatedAt: new Date() }).where(eq(items.id, id));
  const row = await ctx.db.query.items.findFirst({ where: eq(items.id, id) });
  emit(ctx.db, "item.updated", { id, ...patch, source: "api" });
  return json({ data: row });
});
