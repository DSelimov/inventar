import { requireContext } from "@/lib/auth";
import { createDoc, documentHeader, mm, pageNumbers, pdfResponse, table } from "@/lib/pdf";
import { getOrder } from "@/lib/queries";
import { getCompanyDetails } from "@/lib/settings";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { orderVat } from "@/lib/vat";

/** Оферта (клиентска в статус „оферта“), клиентска поръчка или заявка към доставчик — PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("read");
  const id = Number((await params).id);
  const order = Number.isInteger(id) ? await getOrder(ctx.db, id) : null;
  if (!order) return new Response("Поръчката не е намерена.", { status: 404 });
  const company = await getCompanyDetails(ctx.db);
  const purchase = order.type === "purchase";
  const currency = order.currency ?? ctx.org.currency;
  const title = purchase ? "Заявка за доставка" : order.status === "quote" ? "Оферта" : "Поръчка";

  const doc = createDoc({ title: `${title} ${order.number}` });
  documentHeader(doc, {
    company,
    orgName: ctx.org.name,
    title,
    subtitle: `№ ${order.number} от ${formatDate(order.orderDate ?? order.createdAt, "dd.MM.yyyy")}`,
    right: [
      `${purchase ? "Доставчик" : "Клиент"}: ${order.partner?.name ?? "—"}`,
      ...(order.expectedDate ? [`${purchase ? "Очаквана доставка" : "Срок"}: ${formatDate(order.expectedDate, "dd.MM.yyyy")}`] : []),
      ...(order.currency && order.exchangeRate ? [`Валута: ${order.currency} (1 ${order.currency} = ${order.exchangeRate} ${ctx.org.currency})`] : []),
    ],
  });

  const priced = orderVat(order, order.lines.map((l) => ({ ...l, legalBasis: l.vatRateRecord?.legalBasis ?? null })));
  table(
    doc,
    [
      { header: "№", width: 20, align: "right" },
      { header: "Код", width: 72 },
      { header: "Артикул", width: 190 },
      { header: "К-во", width: 44, align: "right" },
      { header: "М.е.", width: 30 },
      { header: "Ед. цена", width: 60, align: "right" },
      { header: "ДДС", width: 28, align: "right" },
      { header: order.pricesIncludeVat ? "Стойност с ДДС" : "Стойност", width: 66, align: "right", bold: true },
    ],
    priced.lines.map((l, i) => [
      String(i + 1),
      l.item.sku,
      l.item.variantLabel ? `${l.item.name} · ${l.item.variantLabel}` : l.item.name,
      formatNumber(l.quantity),
      l.item.unit,
      formatMoney(l.unitPrice, currency),
      `${formatNumber(l.vatRate)} %`,
      formatMoney(order.pricesIncludeVat ? l.grossAmount : l.netAmount, currency),
    ]),
    { zebra: true },
  );
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font("regular").fontSize(9);
  for (const r of priced.rows) {
    const basis = r.rate === 0 && r.legalBasis ? ` (${r.legalBasis})` : "";
    doc.text(`Данъчна основа ${formatNumber(r.rate)} %: ${formatMoney(r.net, currency)} · ДДС: ${formatMoney(r.vat, currency)}${basis}`, doc.page.margins.left, doc.y, { width, align: "right" });
  }
  doc.font("bold").fontSize(10).text(`Общо с ДДС: ${formatMoney(priced.gross, currency)}`, doc.page.margins.left, doc.y, { width, align: "right" });
  if (order.notes) doc.moveDown().font("regular").fontSize(8.5).fillColor("#4b5563").text(`Бележки: ${order.notes}`, { width }).fillColor("black");
  if (order.status === "quote") doc.moveDown(0.5).font("regular").fontSize(8.5).fillColor("#4b5563").text("Офертата не е фактура и не е документ за плащане.", { width }).fillColor("black");

  if (doc.y > doc.page.height - doc.page.margins.bottom - mm(30)) doc.addPage();
  const y = Math.max(doc.y + mm(14), doc.page.height - doc.page.margins.bottom - mm(28));
  doc.font("regular").fontSize(9);
  doc.moveTo(doc.page.margins.left, y + mm(10)).lineTo(doc.page.margins.left + width / 2 - mm(15), y + mm(10)).lineWidth(0.5).strokeColor("#9ca3af").stroke();
  doc.text(company.mol ? `Съставил: ${company.mol}` : "Съставил", doc.page.margins.left, y + mm(11.5), { width: width / 2 - mm(15) });
  pageNumbers(doc, `${ctx.org.name} · ${order.number}`);
  return pdfResponse(doc, `${title}-${order.number}`);
}
