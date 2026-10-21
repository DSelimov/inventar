import { eq } from "drizzle-orm";
import { orderLines } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { createDoc, documentHeader, mm, pageNumbers, pdfResponse, table } from "@/lib/pdf";
import { getShipment } from "@/lib/queries";
import { getCompanyDetails } from "@/lib/settings";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { lineTotal, sumLines, sumMoney } from "@/lib/money";
import { BGN_PER_EUR } from "@/lib/currency";

/** Стокова разписка (изходяща) / приемателен протокол (входяща) за пратка. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("read");
  const id = Number((await params).id);
  const shipment = Number.isInteger(id) ? await getShipment(ctx.db, id) : null;
  if (!shipment) return new Response("Пратката не е намерена.", { status: 404 });
  const company = await getCompanyDetails(ctx.db);
  const inbound = shipment.direction === "inbound";
  const prices = new Map<number, number>();
  const originalPrices = new Map<number, number>();
  if (shipment.orderId) {
    for (const l of await ctx.db.select().from(orderLines).where(eq(orderLines.orderId, shipment.orderId))) {
      prices.set(l.itemId, l.unitPrice);
      if (l.originalUnitPrice !== null) originalPrices.set(l.itemId, l.originalUnitPrice);
    }
  }
  const originalTotal = originalPrices.size ? sumLines(shipment.lines, (l) => l.quantity, (l) => originalPrices.get(l.itemId) ?? 0) : null;

  const title = shipment.isReturn ? (inbound ? "Протокол за връщане от клиент" : "Протокол за връщане към доставчик") : inbound ? "Приемателен протокол" : "Стокова разписка";
  const doc = createDoc({ title: `${title} ${shipment.reference}` });
  const partner = shipment.partnerRecord?.name ?? shipment.partner ?? "—";
  documentHeader(doc, {
    company,
    orgName: ctx.org.name,
    title,
    subtitle: `№ ${shipment.reference} от ${formatDate(shipment.deliveredAt ?? shipment.createdAt, "dd.MM.yyyy")}`,
    right: [
      // обикновена входяща и връщане към доставчик → доставчик; връщане от клиент → клиент
      `${inbound === !shipment.isReturn ? "Доставчик" : shipment.isReturn ? "Клиент" : "Получател"}: ${partner}`,
      `Склад: ${shipment.location?.name ?? "—"}`,
      ...(shipment.order ? [`Поръчка: ${shipment.order.number}`] : []),
      ...(shipment.carrier ? [`Куриер: ${shipment.carrier}${shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}`] : []),
    ],
  });

  let total = 0;
  const rows = shipment.lines.map((l, i) => {
    const price = prices.get(l.itemId) ?? (inbound ? l.item.unitCost : l.item.unitPrice);
    const value = lineTotal(l.quantity, price);
    total = sumMoney([total, value]);
    const lot = l.lot?.lotNumber ?? l.lotNumber ?? "";
    return [String(i + 1), l.item.sku, l.item.variantLabel ? `${l.item.name} · ${l.item.variantLabel}` : l.item.name, lot, formatNumber(l.quantity), l.item.unit, formatMoney(price, ctx.org.currency), formatMoney(value, ctx.org.currency)];
  });
  table(
    doc,
    [
      { header: "№", width: 20, align: "right" },
      { header: "Код", width: 70 },
      { header: "Артикул", width: 150 },
      { header: "Партида / сер. №", width: 70 },
      { header: "К-во", width: 40, align: "right" },
      { header: "М.е.", width: 30 },
      { header: inbound ? "Доставна цена" : "Ед. цена", width: 60, align: "right" },
      { header: "Стойност", width: 60, align: "right", bold: true },
    ],
    rows,
    { zebra: true },
  );
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font("bold").fontSize(10).text(`Общо: ${formatMoney(total, ctx.org.currency)}`, doc.page.margins.left, doc.y, { width, align: "right" });
  if (originalTotal !== null && shipment.order?.originalCurrency) {
    // документ отпреди превалутирането: сумата, с която е издаден
    const rate = shipment.order.originalCurrency === "BGN" ? ` (по курс ${BGN_PER_EUR})` : "";
    doc.font("regular").fontSize(8.5).fillColor("#4b5563").text(`Издаден за ${formatMoney(originalTotal, shipment.order.originalCurrency)}${rate}`, doc.page.margins.left, doc.y, { width, align: "right" }).fillColor("black");
  }
  if (shipment.notes) doc.moveDown().font("regular").fontSize(8.5).fillColor("#4b5563").text(`Бележки: ${shipment.notes}`, { width }).fillColor("black");

  // подписи
  if (doc.y > doc.page.height - doc.page.margins.bottom - mm(30)) doc.addPage();
  const y = Math.max(doc.y + mm(14), doc.page.height - doc.page.margins.bottom - mm(28));
  const left = doc.page.margins.left;
  const half = width / 2;
  doc.font("regular").fontSize(9);
  for (const [i, label] of [inbound ? "Предал (доставчик)" : "Предал", inbound ? "Приел" : "Получил"].entries()) {
    const x = left + i * half;
    doc.moveTo(x, y + mm(10)).lineTo(x + half - mm(15), y + mm(10)).lineWidth(0.5).strokeColor("#9ca3af").stroke();
    doc.text(label, x, y + mm(11.5), { width: half - mm(15) });
    if (i === 0 && !inbound && company.mol) doc.fontSize(8).fillColor("#4b5563").text(company.mol, x, y + mm(15.5)).fillColor("black").fontSize(9);
  }
  pageNumbers(doc, `${ctx.org.name} · ${shipment.reference}`);
  return pdfResponse(doc, `${inbound ? "priemane" : "razpiska"}-${shipment.reference}.pdf`);
}
