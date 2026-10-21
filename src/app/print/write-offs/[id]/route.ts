import { requireContext } from "@/lib/auth";
import { lineTotal, sumMoney } from "@/lib/money";
import { createDoc, documentHeader, mm, pageNumbers, pdfResponse, table } from "@/lib/pdf";
import { getWriteOff } from "@/lib/queries";
import { getCompanyDetails } from "@/lib/settings";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

/** Протокол за брак: стоката, себестойността (при приложен — от движенията, при чернова — текущата) и подписи на комисията и МОЛ. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("read");
  const id = Number((await params).id);
  const wo = Number.isInteger(id) ? await getWriteOff(ctx.db, id) : null;
  if (!wo) return new Response("Протоколът не е намерен.", { status: 404 });
  const company = await getCompanyDetails(ctx.db);
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const applied = wo.status === "applied";

  const doc = createDoc({ title: `Протокол за брак ${wo.number}` });
  documentHeader(doc, {
    company,
    orgName: ctx.org.name,
    title: "Протокол за брак",
    subtitle: `№ ${wo.number} от ${formatDate(wo.appliedAt ?? wo.createdAt, "dd.MM.yyyy")}${applied ? "" : " · ЧЕРНОВА"}`,
    right: [`Склад: ${wo.location?.name ?? "—"}`, `Причина: ${wo.reason}`],
  });

  const rows = wo.lines.map((l, i) => {
    const cost = l.unitCost ?? l.item.unitCost;
    const value = l.value ?? lineTotal(l.quantity, cost);
    return { cells: [String(i + 1), l.item.sku, l.item.variantLabel ? `${l.item.name} · ${l.item.variantLabel}` : l.item.name, l.lot?.lotNumber ?? "", formatNumber(l.quantity), l.item.unit, money(cost), money(value)], value };
  });
  table(
    doc,
    [
      { header: "№", width: 20, align: "right" },
      { header: "Код", width: 70 },
      { header: "Артикул", width: 160 },
      { header: "Партида / сер. №", width: 70 },
      { header: "К-во", width: 40, align: "right" },
      { header: "М.е.", width: 30 },
      { header: "Ед. цена", width: 55, align: "right" },
      { header: "Стойност", width: 60, align: "right", bold: true },
    ],
    rows.map((r) => r.cells),
    { zebra: true },
  );
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font("bold").fontSize(10).text(`Обща стойност на брака: ${money(sumMoney(rows.map((r) => r.value)))}`, doc.page.margins.left, doc.y, { width, align: "right" });
  if (!applied) doc.font("regular").fontSize(8).fillColor("#4b5563").text("Черновата е по текущата себестойност; окончателната се определя при прилагане.", doc.page.margins.left, doc.y, { width, align: "right" }).fillColor("black");
  if (wo.notes) doc.moveDown().font("regular").fontSize(8.5).fillColor("#4b5563").text(`Бележки: ${wo.notes}`, doc.page.margins.left, doc.y, { width }).fillColor("black");

  // комисия (по един член на ред) и МОЛ
  const signers = [...(wo.commission ?? "").split("\n").map((s) => s.trim()).filter(Boolean), company.mol ? `МОЛ: ${company.mol}` : "МОЛ"];
  const perRow = 3;
  const colWidth = width / perRow;
  const rowsNeeded = Math.ceil(signers.length / perRow);
  if (doc.y > doc.page.height - doc.page.margins.bottom - mm(18 * rowsNeeded + 10)) doc.addPage();
  let y = doc.y + mm(12);
  doc.font("regular").fontSize(9).text("Комисия:", doc.page.margins.left, y);
  y += mm(4);
  signers.forEach((name, i) => {
    const x = doc.page.margins.left + (i % perRow) * colWidth;
    const rowY = y + Math.floor(i / perRow) * mm(18);
    doc.moveTo(x, rowY + mm(10)).lineTo(x + colWidth - mm(10), rowY + mm(10)).lineWidth(0.5).strokeColor("#9ca3af").stroke();
    doc.text(name, x, rowY + mm(11.5), { width: colWidth - mm(10) });
  });
  pageNumbers(doc, `${ctx.org.name} · ${wo.number}`);
  return pdfResponse(doc, `brak-${wo.number}.pdf`);
}
