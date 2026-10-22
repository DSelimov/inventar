import { desc } from "drizzle-orm";
import { items, stockMovements } from "@/db/tenant-schema";
import { getContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { toCsv } from "@/lib/csv";
import { label } from "@/lib/utils";
import { lineTotal } from "@/lib/money";
import { purchasesList, RATES, salesJournal } from "@/lib/accounting";
import { encodeCsv, purchaseExportRows, PURCHASE_COLUMNS, readFormat, salesExportRows, SALES_COLUMNS } from "@/lib/accounting-export";

function csvResponse(name: string, rows: Array<Array<string | number | null | undefined>>) {
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
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
      ...rows.filter((r) => r.quantity !== 0).map((r) => [r.item.sku, r.item.name, r.location.name, r.location.code, r.quantity, r.item.unit, lineTotal(r.quantity, r.item.unitCost).toFixed(2)]),
    ]);
  }
  if (kind === "movements") {
    const rows = await db.query.stockMovements.findMany({ with: { item: true, location: true, lot: true }, orderBy: [desc(stockMovements.createdAt)], limit: 5000 });
    return csvResponse("dvizhenia", [
      ["date", "sku", "name", "location", "type", "delta", "quantity_after", "lot", "reason", "user"],
      ...rows.map((r) => [r.createdAt.toISOString(), r.item.sku, r.item.name, r.location?.name, label(r.type), r.delta, r.quantityAfter, r.lot?.lotNumber, r.reason, r.userName]),
    ]);
  }
  if (kind === "accounting-sales" || kind === "accounting-purchases") {
    // за внос в счетоводна програма: кодировка, разделител, десетичен знак и дата по избор
    if (!can(ctx.role, "write")) return new Response("Forbidden", { status: 403 });
    const sp = new URL(req.url).searchParams;
    const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const from = iso(sp.get("from"));
    const to = iso(sp.get("to"));
    if (!from || !to) return new Response("from и to (ГГГГ-ММ-ДД) са задължителни", { status: 400 });
    const f = readFormat(sp);
    const sales = kind === "accounting-sales";
    const rows = sales ? [SALES_COLUMNS, ...(await salesExportRows(db, from, to, f))] : [PURCHASE_COLUMNS, ...(await purchaseExportRows(db, from, to, f))];
    const ext = f.separator === "\t" ? "txt" : "csv";
    return new Response(Buffer.from(encodeCsv(rows, f)), {
      headers: {
        "Content-Type": `${ext === "txt" ? "text/plain" : "text/csv"}; charset=${f.encoding === "cp1251" ? "windows-1251" : "utf-8"}`,
        "Content-Disposition": `attachment; filename="${sales ? "prodajbi" : "dostavki"}-${from}-${to}-${f.encoding}.${ext}"`,
      },
    });
  }
  if (kind === "sales-journal" || kind === "purchases") {
    // за счетоводителя: суми с десетична запетая (Excel на български ги чете като числа)
    if (!can(ctx.role, "write")) return new Response("Forbidden", { status: 403 });
    const sp = new URL(req.url).searchParams;
    const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const from = iso(sp.get("from"));
    const to = iso(sp.get("to"));
    if (!from || !to) return new Response("from и to (ГГГГ-ММ-ДД) са задължителни", { status: 400 });
    const n = (v: number) => v.toFixed(2).replace(".", ",");
    if (kind === "sales-journal") {
      const j = await salesJournal(db, from, to);
      return csvResponse(`prodajbi-${from}-${to}`, [
        ["Вид", "Номер", "Дата", "Дата на ДС", "Контрагент", "ЕИК", "ДДС №", ...RATES.flatMap((r) => [`Основа ${r} %`, `ДДС ${r} %`]), "Общо", "Бележка"],
        ...j.rows.map((r) => [r.kind, r.doc.number, r.doc.issueDate, r.doc.taxEventDate, r.doc.recipientName, r.doc.recipientEik, r.doc.recipientVatNumber, ...RATES.flatMap((rate) => [n(r.byRate[rate].net), n(r.byRate[rate].vat)]), n(r.gross), r.note]),
        ["Общо", "", "", "", "", "", "", ...RATES.flatMap((rate) => [n(j.totals[rate].net), n(j.totals[rate].vat)]), n(j.gross), ""],
      ]);
    }
    const p = await purchasesList(db, from, to);
    return csvResponse(`dostavki-${from}-${to}`, [
      ["Дата", "Пратка", "Вид", "Доставчик", "ЕИК", "ДДС №", "Стойност без ДДС"],
      ...p.rows.map((r) => [r.shipment.deliveredAt?.toISOString().slice(0, 10), r.shipment.reference, r.shipment.isReturn ? "Връщане към доставчик" : "Доставка", r.partner, r.eik, r.vat, n(r.value)]),
      ["Общо", "", "", "", "", "", n(p.total)],
    ]);
  }
  return new Response("Unknown export", { status: 404 });
}
