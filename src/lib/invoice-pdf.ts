import "server-only";
import type { Invoice, InvoiceLine, Partner } from "@/db/tenant-schema";
import { KIND_TITLES } from "./invoicing";
import { createDoc, mm, pageNumbers, pdfBuffer, table } from "./pdf";
import type { CompanyDetails } from "./settings";
import { formatDate, formatMoney, formatNumber } from "./utils";
import { vatSummary } from "./vat";

type Party = { name: string; address: string | null; eik: string | null; vatNumber: string | null; mol: string | null };

/**
 * Фактура / известие / проформа като PDF (А4). Издаденият документ се печата от снимката в него;
 * черновата — с текущите данни и надпис „ЧЕРНОВА“. copy = „Копие“ вместо „Оригинал“.
 */
export async function invoicePdf(o: {
  invoice: Invoice & { lines: InvoiceLine[]; related?: Invoice | null };
  company: CompanyDetails;
  partner: Partner | null;
  orgName: string;
  copy?: boolean;
}) {
  const inv = o.invoice;
  const draft = inv.status === "draft";
  const supplier: Party = draft
    ? { name: o.company.legalName || o.orgName, address: o.company.address, eik: o.company.eik, vatNumber: o.company.vatNumber, mol: o.company.mol }
    : { name: inv.supplierName ?? "", address: inv.supplierAddress, eik: inv.supplierEik, vatNumber: inv.supplierVatNumber, mol: inv.supplierMol };
  const recipient: Party = draft
    ? { name: o.partner?.name ?? "—", address: o.partner?.address ?? null, eik: o.partner?.eik ?? null, vatNumber: o.partner?.vatNumber ?? null, mol: o.partner?.contactName ?? null }
    : { name: inv.recipientName ?? "", address: inv.recipientAddress, eik: inv.recipientEik, vatNumber: inv.recipientVatNumber, mol: inv.recipientMol };
  const money = (v: number) => formatMoney(v, inv.currency);
  const title = KIND_TITLES[inv.kind].toUpperCase();

  const doc = createDoc({ title: `${KIND_TITLES[inv.kind]} ${inv.number ?? "чернова"}` });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const top = doc.page.margins.top;

  // заглавие, номер, оригинал/копие
  doc.font("bold").fontSize(18).fillColor("#111827").text(title, left, top, { width: width * 0.6 });
  doc.font("bold").fontSize(11).text(`№ ${inv.number ?? "—"}`, { width: width * 0.6 });
  const status = inv.status === "cancelled" ? "АНУЛИРАН" : draft ? "ЧЕРНОВА" : o.copy ? "Копие" : "Оригинал";
  doc.font("bold").fontSize(11).fillColor(inv.status === "cancelled" || draft ? "#b91c1c" : "#111827").text(status, left + width * 0.6, top, { width: width * 0.4, align: "right" });
  doc.font("regular").fontSize(9).fillColor("#374151");
  const dates = [
    `Дата на издаване: ${formatDate(inv.issueDate, "dd.MM.yyyy")}`,
    inv.kind !== "proforma" ? `Дата на данъчното събитие: ${formatDate(inv.taxEventDate ?? inv.issueDate, "dd.MM.yyyy")}` : null,
    inv.dueDate ? `Падеж: ${formatDate(inv.dueDate, "dd.MM.yyyy")}` : null,
  ].filter(Boolean) as string[];
  doc.text(dates.join("\n"), left + width * 0.6, doc.y, { width: width * 0.4, align: "right" });
  doc.y = Math.max(doc.y, top + mm(16)) + mm(4);

  // известие: към коя фактура и основание
  if (inv.related) {
    doc.font("regular").fontSize(9).fillColor("#111827").text(`Към фактура № ${inv.related.number} от ${formatDate(inv.related.issueDate, "dd.MM.yyyy")}`, left, doc.y, { width });
  }
  if ((inv.kind === "credit_note" || inv.kind === "debit_note" || inv.status === "cancelled") && inv.reason) {
    doc.font("regular").fontSize(9).text(`${inv.status === "cancelled" ? "Причина за анулиране" : "Основание"}: ${inv.reason}`, left, doc.y, { width });
  }
  doc.moveDown(0.6);

  // доставчик и получател един до друг
  const boxTop = doc.y;
  const half = (width - mm(6)) / 2;
  const party = (label: string, p: Party, x: number) => {
    doc.font("bold").fontSize(8).fillColor("#6b7280").text(label.toUpperCase(), x, boxTop, { width: half });
    doc.font("bold").fontSize(10).fillColor("#111827").text(p.name, x, doc.y + 2, { width: half });
    doc.font("regular").fontSize(8.5).fillColor("#374151");
    for (const line of [p.address, p.eik && `ЕИК: ${p.eik}`, p.vatNumber && `ДДС №: ${p.vatNumber}`, p.mol && `МОЛ: ${p.mol}`]) if (line) doc.text(line, x, doc.y, { width: half });
    return doc.y;
  };
  const endLeft = party("Доставчик", supplier, left);
  const endRight = party("Получател", recipient, left + half + mm(6));
  doc.y = Math.max(endLeft, endRight) + mm(6);
  doc.x = left;

  // редове
  table(
    doc,
    [
      { header: "№", width: 20, align: "right" },
      { header: "Описание", width: 200 },
      { header: "М.е.", width: 34 },
      { header: "К-во", width: 44, align: "right" },
      { header: inv.pricesIncludeVat ? "Ед. цена с ДДС" : "Ед. цена", width: 62, align: "right" },
      { header: "ДДС", width: 32, align: "right" },
      { header: "Стойност", width: 70, align: "right", bold: true },
    ],
    inv.lines.map((l, i) => [String(i + 1), l.description, l.unit, formatNumber(l.quantity), money(l.unitPrice), `${formatNumber(l.vatRate)} %`, money(inv.pricesIncludeVat ? l.grossAmount : l.netAmount)]),
    { zebra: true },
  );

  // обобщение по ставка
  const sum = vatSummary(inv.lines);
  const totalsX = left + width * 0.45;
  const totalsW = width * 0.55;
  const row = (labelText: string, value: string, bold = false) => {
    const y = doc.y;
    doc.font(bold ? "bold" : "regular").fontSize(bold ? 10.5 : 9).fillColor("#111827");
    doc.text(labelText, totalsX, y, { width: totalsW * 0.65 });
    doc.text(value, totalsX + totalsW * 0.65, y, { width: totalsW * 0.35, align: "right" });
  };
  doc.moveDown(0.4);
  for (const r of sum.rows) {
    row(`Данъчна основа ${formatNumber(r.rate)} %`, money(r.net));
    row(`ДДС ${formatNumber(r.rate)} %`, money(r.vat));
    if (r.rate === 0 && r.legalBasis) {
      doc.font("regular").fontSize(8).fillColor("#4b5563").text(`Основание за неначисляване на ДДС: ${r.legalBasis}`, totalsX, doc.y, { width: totalsW });
    }
  }
  row(inv.kind === "credit_note" ? "Сума за намаление" : "Сума за плащане", money(sum.gross), true);

  // плащане и подписи
  doc.moveDown(1);
  doc.font("regular").fontSize(8.5).fillColor("#374151");
  const pay = [inv.paymentMethod && `Начин на плащане: ${inv.paymentMethod}`, o.company.iban && inv.kind !== "credit_note" && `IBAN: ${o.company.iban}${o.company.bank ? ` · ${o.company.bank}` : ""}`].filter(Boolean) as string[];
  if (pay.length) doc.text(pay.join("\n"), left, doc.y, { width });
  if (inv.notes) doc.text(`Бележки: ${inv.notes}`, left, doc.y + 4, { width });
  if (inv.kind === "proforma") doc.font("bold").text("Проформата не е данъчен документ.", left, doc.y + 4, { width });

  if (doc.y > doc.page.height - doc.page.margins.bottom - mm(30)) doc.addPage();
  const y = Math.max(doc.y + mm(14), doc.page.height - doc.page.margins.bottom - mm(26));
  doc.font("regular").fontSize(9).fillColor("#111827");
  [["Получател", ""], ["Съставил", inv.issuedBy ?? inv.createdBy ?? ""]].forEach(([labelText, name], i) => {
    const x = left + i * (width / 2);
    doc.moveTo(x, y + mm(10)).lineTo(x + width / 2 - mm(15), y + mm(10)).lineWidth(0.5).strokeColor("#9ca3af").stroke();
    doc.text(labelText, x, y + mm(11.5), { width: width / 2 - mm(15) });
    if (name) doc.fontSize(8).fillColor("#4b5563").text(name, x, doc.y).fillColor("#111827").fontSize(9);
  });
  pageNumbers(doc, `${supplier.name} · ${KIND_TITLES[inv.kind]} № ${inv.number ?? "чернова"}`);
  return pdfBuffer(doc);
}

export const invoiceFileName = (inv: Pick<Invoice, "kind" | "number">) => `${{ invoice: "faktura", credit_note: "kreditno", debit_note: "debitno", proforma: "proforma" }[inv.kind]}-${inv.number ?? "chernova"}.pdf`;
