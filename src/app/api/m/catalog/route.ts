import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { itemUnits, items, locations, stockCounts } from "@/db/tenant-schema";
import { getContext } from "@/lib/auth";

/** Каталог за мобилния режим (кешира се на телефона за работа без връзка). */
export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Влезте отново." }, { status: 401 });
  const [catalog, packs, locs, counts] = await Promise.all([
    ctx.db
      .select({ id: items.id, sku: items.sku, barcode: items.barcode, name: items.name, variantLabel: items.variantLabel, unit: items.unit, quantityDecimals: items.quantityDecimals, tracking: items.tracking, quantity: items.quantity })
      .from(items)
      .where(eq(items.status, "active")),
    ctx.db.select({ itemId: itemUnits.itemId, name: itemUnits.name, factor: itemUnits.factor, barcode: itemUnits.barcode }).from(itemUnits),
    ctx.db.select({ id: locations.id, name: locations.name, isDefault: locations.isDefault }).from(locations).where(eq(locations.active, true)),
    ctx.db.select({ id: stockCounts.id, number: stockCounts.number, locationId: stockCounts.locationId }).from(stockCounts).where(eq(stockCounts.status, "open")),
  ]);
  return NextResponse.json({ items: catalog, packs, locations: locs, counts, role: ctx.role, at: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}
