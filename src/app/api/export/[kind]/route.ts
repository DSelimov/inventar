import { desc } from "drizzle-orm";
import { items, stockMovements } from "@/db/tenant-schema";
import { getContext } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { label } from "@/lib/utils";

function csvResponse(name: string, rows: Array<Array<string | number | null | undefined>>) {
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { kind } = await params;
  const db = ctx.db;

  if (kind === "template") {
    return csvResponse("shablon-artikuli", [
      ["sku", "name", "barcode", "category", "quantity", "min", "unit", "cost", "price", "location", "description"],
      ["ART-001", "Примерен артикул", "3800000000001", "Категория", 10, 2, "бр.", "4.50", "9.90", "Основен склад", "Описание"],
    ]);
  }
  if (kind === "items") {
    const rows = await db.query.items.findMany({ with: { category: true }, orderBy: [items.name] });
    return csvResponse("artikuli", [
      ["sku", "name", "variant", "barcode", "category", "quantity", "min", "unit", "cost", "price", "status", "tracking"],
      ...rows.map((r) => [r.sku, r.name, r.variantLabel, r.barcode, r.category?.name, r.quantity, r.minQuantity, r.unit, r.unitCost, r.unitPrice, r.status, r.tracking]),
    ]);
  }
  if (kind === "stock") {
    const rows = await db.query.stockLevels.findMany({ with: { item: true, location: true } });
    return csvResponse("nalichnosti", [
      ["sku", "name", "location", "location_code", "quantity", "unit", "value_at_cost"],
      ...rows.filter((r) => r.quantity !== 0).map((r) => [r.item.sku, r.item.name, r.location.name, r.location.code, r.quantity, r.item.unit, (r.quantity * r.item.unitCost).toFixed(2)]),
    ]);
  }
  if (kind === "movements") {
    const rows = await db.query.stockMovements.findMany({ with: { item: true, location: true, lot: true }, orderBy: [desc(stockMovements.createdAt)], limit: 5000 });
    return csvResponse("dvizhenia", [
      ["date", "sku", "name", "location", "type", "delta", "quantity_after", "lot", "reason", "user"],
      ...rows.map((r) => [r.createdAt.toISOString(), r.item.sku, r.item.name, r.location?.name, label(r.type), r.delta, r.quantityAfter, r.lot?.lotNumber, r.reason, r.userName]),
    ]);
  }
  return new Response("Unknown export", { status: 404 });
}
