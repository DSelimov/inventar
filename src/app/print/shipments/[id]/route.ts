import { eq } from "drizzle-orm";
import { orderLines } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { createDoc, documentHeader, mm, pageNumbers, pdfResponse, table } from "@/lib/pdf";
import { getShipment, listVatRates } from "@/lib/queries";
import { getCompanyDetails, getSettings } from "@/lib/settings";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { sumLines } from "@/lib/money";
import { orderVat } from "@/lib/vat";
import { assignVat } from "@/lib/vat-rates";
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
  const vatOf = new Map<number, { rate: number; legalBasis: string | null }>();
  if (shipment.orderId) {
    for (const l of await ctx.db.query.orderLines.findMany({ where: eq(orderLines.orderId, shipment.orderId), with: { vatRateRecord: true } })) {
      prices.set(l.itemId, l.unitPrice);
      vatOf.set(l.itemId, { rate: l.vatRate, legalBasis: l.vatRateRecord?.legalBasis ?? null });
      if (l.originalUnitPrice !== null) originalPrices.set(l.itemId, l.originalUnitPrice);
    }
  }
  // без поръчка: ДДС на артикула/категорията; продажните цени следват настройката „с ДДС“, доставните са без ДДС
  const missing = shipment.lines.filter((l) => !vatOf.has(l.itemId));
  if (missing.length) {
    const rates = new Map((await listVatRates(ctx.db, false)).map((r) => [r.id, r]));
    for (const l of await assignVat(ctx.db, missing.map((m) => ({ itemId: m.itemId })))) vatOf.set(l.itemId, { rate: l.vatRate, legalBasis: rates.get(l.vatRateId)?.legalBasis ?? null });
  }
  const pricesIncludeVat = shipment.order ? shipment.order.pricesIncludeVat : !inbound && (await getSettings(ctx.db)).pricesIncludeVat;
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

  const priced = orderVat(
    { pricesIncludeVat },
    shipment.lines.map((l) => ({ ...l, unitPrice: prices.get(l.itemId) ?? (inbound ? l.item.unitCost : l.item.unitPrice), vatRate: vatOf.get(l.itemId)?.rate ?? 0, legalBasis: vatOf.get(l.itemId)?.legalBasis ?? null })),
  );
  const rows = priced.lines.map((l, i) => {
    const price = l.unitPrice;
    const value = pricesIncludeVat ? l.grossAmount : l.netAmount;
    const lot = l.lot?.lotNumber ?? l.lotNumber ?? "";
    return [String(i + 1), l.item.sku, l.item.variantLabel ? `${l.item.name} · ${l.item.variantLabel}` : l.item.name, lot, formatNumber(l.quantity), l.item.unit, formatMoney(price, ctx.org.currency), `${formatNumber(l.vatRate)} %`, formatMoney(value, ctx.org.currency)];
  });
  table(
    doc,
    [
      { header: "№", width: 20, align: "right" },
      { header: "Код", width: 70 },
      { header: "Артикул", width: 150 },
      { header: "Партида / сер. №", width: 62 },
      { header: "К-во", width: 38, align: "right" },
      { header: "М.е.", width: 28 },
      { header: inbound ? "Доставна цена" : "Ед. цена", width: 56, align: "right" },
      { header: "ДДС", width: 26, align: "right" },
      { header: pricesIncludeVat ? "Стойност с ДДС" : "Стойност", width: 60, align: "right", bold: true },
    ],
    rows,
    { zebra: true },
  );
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  // данъчна основа и ДДС по ставка, после общо
  doc.font("regular").fontSize(9);
  for (const r of priced.rows) {
    const basis = r.rate === 0 && r.legalBasis ? ` (${r.legalBasis})` : "";
    doc.text(`Данъчна основа ${formatNumber(r.rate)} %: ${formatMoney(r.net, ctx.org.currency)} · ДДС: ${formatMoney(r.vat, ctx.org.currency)}${basis}`, doc.page.margins.left, doc.y, { width, align: "right" });
  }
  doc.font("bold").fontSize(10).text(`Общо с ДДС: ${formatMoney(priced.gross, ctx.org.currency)}`, doc.page.margins.left, doc.y, { width, align: "right" });
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
