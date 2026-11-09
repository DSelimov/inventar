import { eq } from "drizzle-orm";
import { categories, locations } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { MOVEMENT_TYPE_OPTIONS, movementReport, readMovementReportFilters } from "@/lib/movement-report";
import { createDoc, documentHeader, pageNumbers, pdfResponse, table, type Column } from "@/lib/pdf";
import { getCompanyDetails } from "@/lib/settings";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

/** PDF на справката „Приход и разход за период“ (същите филтри като /reports/movements), групирана по категория. */
export async function GET(req: Request) {
  const ctx = await requireContext("read");
  const f = readMovementReportFilters(Object.fromEntries(new URL(req.url).searchParams), ctx.locations);
  const [report, company, location, category] = await Promise.all([
    movementReport(ctx.db, f),
    getCompanyDetails(ctx.db),
    f.locationId ? ctx.db.query.locations.findFirst({ where: eq(locations.id, f.locationId) }) : null,
    f.categoryId ? ctx.db.query.categories.findFirst({ where: eq(categories.id, f.categoryId) }) : null,
  ]);
  const values = !ctx.hideCosts;
  const money = (v: number) => formatMoney(v, ctx.org.currency);
  const period = f.from === f.to ? `за ${formatDate(f.from, "dd.MM.yyyy")}` : `за периода ${formatDate(f.from, "dd.MM.yyyy")} – ${formatDate(f.to, "dd.MM.yyyy")}`;

  const doc = createDoc({ title: "Приход и разход за период", layout: "landscape" });
  documentHeader(doc, {
    company,
    orgName: ctx.org.name,
    title: "Приход и разход",
    subtitle: [
      period,
      location ? `локация „${location.name}“` : "всички локации",
      category ? `категория „${category.name}“` : null,
      f.type ? MOVEMENT_TYPE_OPTIONS.find((o) => o.value === f.type)?.label : null,
      f.direction === "in" ? "само приход" : f.direction === "out" ? "само разход" : null,
      f.q ? `търсене „${f.q}“` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    right: [`Отпечатано от: ${ctx.user.name}`, `на ${formatDate(new Date(), "dd.MM.yyyy HH:mm")}`],
  });

  const columns: Column[] = [
    { header: "Код", width: 85 },
    { header: "Артикул", width: values ? 205 : 330 },
    { header: "М.е.", width: 35 },
    { header: "Начално", width: 55, align: "right" },
    { header: "Получено", width: 55, align: "right" },
    { header: "Изписано", width: 55, align: "right" },
    { header: "Крайно", width: 55, align: "right", bold: true },
    ...(values
      ? ([
          { header: "Ст-ст приход", width: 70, align: "right" },
          { header: "Ст-ст разход", width: 70, align: "right" },
          { header: "Крайна ст-ст", width: 70, align: "right" },
        ] as Column[])
      : []),
  ];
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  if (!report.rows.length) doc.font("regular").fontSize(10).text("Няма движения за избрания период.", doc.page.margins.left, doc.y);
  for (const g of report.groups) {
    doc.moveDown(0.4).font("bold").fontSize(10).text(`${g.name} · ${g.totals.items} арт.`, doc.page.margins.left, doc.y, { width });
    table(
      doc,
      columns,
      [
        ...g.rows.map((r) => [
          r.sku,
          r.variant ? `${r.name} · ${r.variant}` : r.name,
          r.unit,
          formatNumber(r.openingQty),
          r.inQty ? `+${formatNumber(r.inQty)}` : "—",
          r.outQty ? `−${formatNumber(r.outQty)}` : "—",
          formatNumber(r.closingQty),
          ...(values ? [r.inValue ? money(r.inValue) : "—", r.outValue ? money(r.outValue) : "—", money(r.closingValue)] : []),
        ]),
        ...(values ? [["", `Общо „${g.name}“`, "", "", "", "", "", money(g.totals.inValue), money(g.totals.outValue), money(g.totals.closingValue)]] : []),
      ],
      { zebra: true, fontSize: 8 },
    );
  }
  if (report.rows.length) {
    const summary = [`${report.totals.items} артикула`, `${report.totals.moves} движения`, ...(values ? [`получено ${money(report.totals.inValue)}`, `изписано ${money(report.totals.outValue)}`, `крайна стойност ${money(report.totals.closingValue)}`] : [])];
    doc.moveDown(0.6).font("bold").fontSize(10).text(summary.join(" · "), doc.page.margins.left, doc.y, { width, align: "right" });
  }
  pageNumbers(doc, `${ctx.org.name} · приход и разход ${period}`);
  return pdfResponse(doc, f.from === f.to ? `prihod-razhod-${f.from}.pdf` : `prihod-razhod-${f.from}_${f.to}.pdf`);
}
