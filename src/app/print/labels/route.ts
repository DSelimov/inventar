import { inArray } from "drizzle-orm";
import { items as itemsTable, type Item } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { barcodePng, createDoc, mm, pdfResponse } from "@/lib/pdf";
import { listItems } from "@/lib/queries";
import { formatMoney } from "@/lib/utils";

/**
 * Етикети с баркод, лист A4 с 3 × 8 етикета по 70 × 37 mm.
 *   ?item=5&item=7       избрани артикули (иначе — филтрите на списъка: q, category, location, status, low)
 *   &copies=3            брой етикети от всеки артикул (1–100)
 *   &skip=4              пропуска първите N места (вече използван лист)
 *   &price=0             без цена
 */
const COLS = 3;
const ROWS = 8;
const W = mm(70);
const H = mm(37);
const MAX_LABELS = 2000;

export async function GET(req: Request) {
  const ctx = await requireContext("read");
  const sp = new URL(req.url).searchParams;
  const ids = sp.getAll("item").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const copies = Math.min(100, Math.max(1, Number(sp.get("copies")) || 1));
  const skip = Math.min(COLS * ROWS - 1, Math.max(0, Number(sp.get("skip")) || 0));
  const showPrice = sp.get("price") !== "0";

  let list: Item[];
  if (ids.length) {
    const rows = await ctx.db.select().from(itemsTable).where(inArray(itemsTable.id, ids));
    list = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is Item => Boolean(r));
  } else {
    const status = sp.get("status");
    list = await listItems(ctx.db, {
      q: sp.get("q") || undefined,
      categoryId: Number(sp.get("category")) || undefined,
      locationId: Number(sp.get("location")) || undefined,
      status: status === "archived" || status === "all" ? status : "active",
      low: sp.get("low") === "1",
    });
  }
  if (!list.length) return new Response("Няма артикули за етикети.", { status: 404 });
  const labels = list.flatMap((it) => Array<Item>(copies).fill(it)).slice(0, MAX_LABELS);

  const doc = createDoc({ title: "Етикети", margin: 0 });
  const offsetX = (doc.page.width - COLS * W) / 2;
  const offsetY = (doc.page.height - ROWS * H) / 2;
  const codes = new Map<string, Buffer>();

  for (let i = 0; i < labels.length; i++) {
    const slot = i + skip;
    if (slot > 0 && slot % (COLS * ROWS) === 0) doc.addPage({ size: "A4", margin: 0 });
    const cell = slot % (COLS * ROWS);
    const x = offsetX + (cell % COLS) * W + mm(4);
    const y = offsetY + Math.floor(cell / COLS) * H + mm(3);
    const w = W - mm(8);
    const it = labels[i];
    const code = it.barcode || it.sku;
    if (!codes.has(code)) codes.set(code, await barcodePng(code));

    doc.font("bold").fontSize(8.5).fillColor("black");
    const name = it.variantLabel ? `${it.name} · ${it.variantLabel}` : it.name;
    doc.text(name, x, y, { width: showPrice ? w - mm(18) : w, height: mm(8), ellipsis: true });
    if (showPrice) doc.font("bold").fontSize(10).text(formatMoney(it.unitPrice, ctx.org.currency), x + w - mm(18), y, { width: mm(18), align: "right", lineBreak: false });
    doc.font("regular").fontSize(6.5).fillColor("#4b5563").text(it.sku, x, y + mm(8.5), { width: w, lineBreak: false });
    doc.image(codes.get(code)!, x, y + mm(12), { fit: [w, mm(18)], align: "center", valign: "center" });
  }
  return pdfResponse(doc, labels.length === copies && list.length === 1 ? `etiketi-${list[0].sku}.pdf` : "etiketi.pdf");
}
