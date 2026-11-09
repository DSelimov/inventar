import { requireContext } from "@/lib/auth";
import { createDoc, documentHeader, mm, pageNumbers, pdfResponse, table } from "@/lib/pdf";
import { getCompanyDetails } from "@/lib/settings";
import { getTransfer, transferMovedLots, TRANSFER_STATUS_LABELS } from "@/lib/transfers";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";

/** Стокова разписка за вътрешно преместване: от кой към кой обект, стоката с партидите и подписи „Предал“ / „Приел“. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("read");
  const t = await getTransfer(ctx.db, Number((await params).id));
  if (!t) return new Response("Не е намерен", { status: 404 });
  const [company, moved] = await Promise.all([getCompanyDetails(ctx.db), t.status === "completed" ? transferMovedLots(ctx.db, t.number) : Promise.resolve([])]);

  const doc = createDoc({ title: `Трансфер ${t.number}` });
  documentHeader(doc, {
    company,
    orgName: ctx.org.name,
    title: "Стокова разписка за вътрешно преместване",
    subtitle: `№ ${t.number} · ${t.from?.name ?? "—"} → ${t.to?.name ?? "—"}`,
    right: [
      `Статус: ${TRANSFER_STATUS_LABELS[t.status]}`,
      t.completedAt ? `Изпълнен: ${formatDateTime(t.completedAt)}` : `Създаден: ${formatDateTime(t.createdAt)}`,
    ],
  });

  const lotText = (l: (typeof t.lines)[number]) => {
    if (l.tracking === "none") return "—";
    if (l.lotNumber) return `${l.lotNumber}${l.expiryDate ? ` · до ${formatDate(l.expiryDate, "dd.MM.yyyy")}` : ""}`;
    const done = moved.filter((m) => m.itemId === l.itemId && m.lotNumber);
    if (!done.length) return "по най-близък срок";
    return done.map((m) => `${m.lotNumber} (${formatNumber(m.quantity)})${m.expiryDate ? ` до ${formatDate(m.expiryDate, "dd.MM.yyyy")}` : ""}`).join("; ");
  };
  table(
    doc,
    [
      { header: "№", width: 22, align: "right" },
      { header: "Код", width: 80 },
      { header: "Артикул", width: 190 },
      { header: "Партида / срок", width: 120 },
      { header: "М.е.", width: 35 },
      { header: "Количество", width: 63, align: "right", bold: true },
    ],
    t.lines.map((l, i) => [String(i + 1), l.sku, l.variant ? `${l.name} · ${l.variant}` : l.name, lotText(l), l.unit, formatNumber(l.quantity)]),
    { zebra: true },
  );

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const units = t.lines.reduce((s, l) => Math.round((s + l.quantity) * 1000) / 1000, 0);
  doc.font("bold").fontSize(10).text(`${t.lines.length} реда · ${formatNumber(units)} единици`, doc.page.margins.left, doc.y, { width, align: "right" });
  if (t.notes) doc.moveDown().font("regular").fontSize(8.5).fillColor("#4b5563").text(`Бележка: ${t.notes}`, doc.page.margins.left, doc.y, { width }).fillColor("black");

  // подписи: предал (изходен обект) и приел (целеви обект)
  if (doc.y > doc.page.height - doc.page.margins.bottom - mm(32)) doc.addPage();
  const y = doc.y + mm(14);
  const col = width / 2;
  [`Предал (${t.from?.name ?? ""})`, `Приел (${t.to?.name ?? ""})`].forEach((label, i) => {
    const x = doc.page.margins.left + i * col;
    doc.moveTo(x, y + mm(10)).lineTo(x + col - mm(12), y + mm(10)).lineWidth(0.5).strokeColor("#9ca3af").stroke();
    doc.font("regular").fontSize(9).fillColor("black").text(label, x, y + mm(11.5), { width: col - mm(12) });
    doc.fontSize(7.5).fillColor("#6b7280").text("име, подпис, дата", x, doc.y, { width: col - mm(12) }).fillColor("black");
  });
  pageNumbers(doc, `${ctx.org.name} · ${t.number}`);
  return pdfResponse(doc, `transfer-${t.number}.pdf`);
}
