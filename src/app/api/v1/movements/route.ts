import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { ApiError, handler, json, readJson } from "@/lib/api";
import { applyMovement } from "@/lib/stock";

type Body = { itemId?: number; sku?: string; locationId: number; type: "in" | "out" | "adjust"; quantity: number; reason?: string; lotNumber?: string; expiryDate?: string; lotId?: number };

export const POST = handler("write", async (req, ctx) => {
  const b = await readJson<Body>(req);
  if (!["in", "out", "adjust"].includes(b.type)) throw new ApiError(422, "type трябва да е in, out или adjust.");
  if (!Number.isInteger(b.quantity) || b.quantity < 0) throw new ApiError(422, "quantity трябва да е цяло неотрицателно число.");
  if (!b.locationId) throw new ApiError(422, "locationId е задължително.");
  const item = await db.query.items.findFirst({
    where: and(eq(items.organizationId, ctx.orgId), b.itemId ? eq(items.id, b.itemId) : eq(items.sku, b.sku ?? "")),
  });
  if (!item) throw new ApiError(404, "Артикулът не е намерен.");
  const result = await db.transaction((tx) =>
    applyMovement(tx, {
      orgId: ctx.orgId,
      userId: null,
      itemId: item.id,
      locationId: b.locationId,
      type: b.type,
      quantity: b.quantity,
      reason: b.reason ?? "API",
      lot: b.lotId ? { lotId: b.lotId } : b.lotNumber ? { lotNumber: b.lotNumber, expiryDate: b.expiryDate ?? null } : null,
    }),
  );
  return json({ data: { itemId: item.id, sku: item.sku, ...result } }, 201);
});
