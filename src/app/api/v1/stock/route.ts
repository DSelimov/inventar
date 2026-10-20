import { eq } from "drizzle-orm";
import { items, locations, stockLevels } from "@/db/tenant-schema";
import { handler, json } from "@/lib/api";

export const GET = handler("read", async (req, ctx) => {
  const itemId = Number(new URL(req.url).searchParams.get("itemId")) || undefined;
  const rows = await ctx.db
    .select({ itemId: stockLevels.itemId, sku: items.sku, name: items.name, locationId: stockLevels.locationId, location: locations.name, quantity: stockLevels.quantity, minQuantity: stockLevels.minQuantity, unit: items.unit })
    .from(stockLevels)
    .innerJoin(items, eq(items.id, stockLevels.itemId))
    .innerJoin(locations, eq(locations.id, stockLevels.locationId))
    .where(itemId ? eq(stockLevels.itemId, itemId) : undefined);
  return json({ data: rows });
});
