import { eq } from "drizzle-orm";
import { items } from "@/db/tenant-schema";
import { ApiError, handler, json, readJson } from "@/lib/api";
import { applyMovement } from "@/lib/stock";
import { parseMoney } from "@/lib/money";

type Body = { itemId?: number; sku?: string; locationId: number; type: "in" | "out" | "adjust"; quantity: number; reason?: string; lotNumber?: string; expiryDate?: string; lotId?: number; unitCost?: number };

export const POST = handler("write", async (req, ctx) => {
  const b = await readJson<Body>(req);
  if (!["in", "out", "adjust"].includes(b.type)) throw new ApiError(422, "type трябва да е in, out или adjust.");
  if (typeof b.quantity !== "number" || !Number.isFinite(b.quantity) || b.quantity < 0) throw new ApiError(422, "quantity трябва да е неотрицателно число (дробно само за артикули с quantityDecimals > 0).");
  if (!b.locationId) throw new ApiError(422, "locationId е задължително.");
  const item = await ctx.db.query.items.findFirst({ where: b.itemId ? eq(items.id, b.itemId) : eq(items.sku, b.sku ?? "") });
  if (!item) throw new ApiError(404, "Артикулът не е намерен.");
  const result = await ctx.db.transaction((tx) =>
    applyMovement(tx, {
      actor: null,
      itemId: item.id,
      locationId: b.locationId,
      type: b.type,
      quantity: b.quantity,
      reason: b.reason ?? "API",
      unitCost: b.type === "in" ? parseMoney(b.unitCost, "unitCost", null) : null,
      lot: b.lotId ? { lotId: b.lotId } : b.lotNumber ? { lotNumber: b.lotNumber, expiryDate: b.expiryDate ?? null } : null,
    }),
  );
  return json({ data: { itemId: item.id, sku: item.sku, ...result } }, 201);
});
