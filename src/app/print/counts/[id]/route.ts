import { requireContext } from "@/lib/auth";
import { createDoc, documentHeader, mm, pageNumbers, pdfResponse, table } from "@/lib/pdf";
import { getStockCount } from "@/lib/queries";
import { getCompanyDetails } from "@/lib/settings";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { lineTotal, sumMoney } from "@/lib/money";

/**
 * Инвентаризация като PDF: лист за броене (?blind=1 — без очакваните количества, за честно броене)
 * или протокол с разликите и подписи на комисията.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("read");
  const count = await getStockCount(ctx.db, Number((await params).id));
  if (!count) return new Response("Инвентаризацията не е намерена.", { status: 404 });
  const blind = new URL(req.url).searchParams.get("blind") === "1";
  const company = await getCompanyDetails(ctx.db);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const lines = [...count.lines].sort((a, b) => a.item.name.localeCompare(b.item.name, "bg") || (a.lotNumber ?? "").localeCompare(b.lotNumber ?? ""));

  const doc = createDoc({ title: `${blind ? "Лист за броене" : "Инвентаризационен протокол"} ${count.number}` });
  documentHeader(doc, {
    company,
    orgName: ctx.org.name,
    title: blind ? "Лист за броене" : "Инвентаризационен протокол",
    subtitle: `${count.number} · ${count.location.name}${count.category ? ` · ${count.category.name}` : ""} · ${formatDate(count.createdAt, "dd.MM.yyyy")}`,
    right: count.appliedAt ? [`Приложена: ${formatDate(count.appliedAt, "dd.MM.yyyy HH:mm")}`, count.appliedBy ?? ""] : [],
  });

  if (blind) {
    table(
      doc,
      [
        { header: "№", width: 22, align: "right" },
        { header: "Код", width: 80 },
        { header: "Артикул", width: 200 },
        { header: "Партида / сер. №", width: 80 },
        { header: "М.е.", width: 32 },
        { header: "Преброено", width: 70 },
      ],
      lines.map((l, i) => [String(i + 1), l.item.sku, l.item.variantLabel ? `${l.item.name} · ${l.item.variantLabel}` : l.item.name, l.lotNumber ?? "", l.item.unit, l.counted !== null ? String(l.counted) : ""]),
      { fontSize: 9 },
    );
  } else {
    let delta = 0;
    table(
      doc,
      [
        { header: "Код", width: 70 },
        { header: "Артикул", width: 130 },
        { header: "Партида", width: 62 },
        { header: "Очакв.", width: 46, align: "right" },
        { header: "Преброено", width: 56, align: "right" },
        { header: "Разлика", width: 46, align: "right", bold: true },
        { header: "Стойност", width: 60, align: "right" },
      ],
      lines.map((l) => {
        const d = l.counted === null ? null : l.counted - l.expected;
        const value = d ? lineTotal(d, l.item.unitCost) : 0;
        delta = sumMoney([delta, value]);
        return [l.item.sku, l.item.variantLabel ? `${l.item.name} · ${l.item.variantLabel}` : l.item.name, l.lotNumber ?? "", formatNumber(l.expected), l.counted === null ? "—" : formatNumber(l.counted), d === null || d === 0 ? "" : d > 0 ? `+${formatNumber(d)}` : formatNumber(d), d ? money(value) : ""];
      }),
      { zebra: true },
    );
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.font("regular").fontSize(8).fillColor("#4b5563").text("„—“ = не е преброено (наличността не е коригирана).", doc.page.margins.left, doc.y, { width }).fillColor("black");
    doc.font("bold").fontSize(10).text(`Разлика в стойността: ${delta > 0 ? "+" : ""}${money(delta)}`, doc.page.margins.left, doc.y, { width, align: "right" });
  }

  // подписи на комисията
  if (doc.y > doc.page.height - doc.page.margins.bottom - mm(32)) doc.addPage();
  const y = Math.max(doc.y + mm(12), doc.page.height - doc.page.margins.bottom - mm(28));
  const left = doc.page.margins.left;
  const third = (doc.page.width - left - doc.page.margins.right) / 3;
  doc.font("regular").fontSize(9);
  ["Преброил", "Проверил", "МОЛ"].forEach((label, i) => {
    const x = left + i * third;
    doc.moveTo(x, y + mm(10)).lineTo(x + third - mm(10), y + mm(10)).lineWidth(0.5).strokeColor("#9ca3af").stroke();
    doc.text(label, x, y + mm(11.5), { width: third - mm(10) });
  });
  pageNumbers(doc, `${ctx.org.name} · ${count.number}`);
  return pdfResponse(doc, `${blind ? "list" : "protokol"}-${count.number}.pdf`);
}
