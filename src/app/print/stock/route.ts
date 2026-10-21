import { and, asc, eq, gt, ne } from "drizzle-orm";
import { categories, items, locations, stockLevels } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { createDoc, documentHeader, pageNumbers, pdfResponse, table } from "@/lib/pdf";
import { getCompanyDetails } from "@/lib/settings";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

/** Справка за наличност към момента. ?location=ID — само в тази локация; ?category=ID; ?zero=1 — и нулевите. */
export async function GET(req: Request) {
  const ctx = await requireContext("read");
  const sp = new URL(req.url).searchParams;
  const locationId = Number(sp.get("location")) || null;
  const categoryId = Number(sp.get("category")) || null;
  const withZero = sp.get("zero") === "1";
  const [company, location, category] = await Promise.all([
    getCompanyDetails(ctx.db),
    locationId ? ctx.db.query.locations.findFirst({ where: eq(locations.id, locationId) }) : null,
    categoryId ? ctx.db.query.categories.findFirst({ where: eq(categories.id, categoryId) }) : null,
  ]);

  const conds = [eq(items.status, "active")];
  if (categoryId) conds.push(eq(items.categoryId, categoryId));
  const rows = locationId
    ? await ctx.db
        .select({ sku: items.sku, name: items.name, variant: items.variantLabel, unit: items.unit, cost: items.unitCost, category: categories.name, qty: stockLevels.quantity })
        .from(stockLevels)
        .innerJoin(items, eq(items.id, stockLevels.itemId))
        .leftJoin(categories, eq(categories.id, items.categoryId))
        .where(and(...conds, eq(stockLevels.locationId, locationId), withZero ? undefined : ne(stockLevels.quantity, 0)))
        .orderBy(asc(items.name), asc(items.variantLabel))
    : await ctx.db
        .select({ sku: items.sku, name: items.name, variant: items.variantLabel, unit: items.unit, cost: items.unitCost, category: categories.name, qty: items.quantity })
        .from(items)
        .leftJoin(categories, eq(categories.id, items.categoryId))
        .where(and(...conds, withZero ? undefined : gt(items.quantity, 0)))
        .orderBy(asc(items.name), asc(items.variantLabel));

  const now = new Date();
  const doc = createDoc({ title: "Справка за наличност" });
  documentHeader(doc, {
    company,
    orgName: ctx.org.name,
    title: "Справка за наличност",
    subtitle: [`към ${formatDate(now, "dd.MM.yyyy HH:mm")}`, location ? `локация „${location.name}“` : "всички локации", category ? `категория „${category.name}“` : null].filter(Boolean).join(" · "),
    right: [`Отпечатано от: ${ctx.user.name}`],
  });
  let units = 0;
  let value = 0;
  table(
    doc,
    [
      { header: "Код", width: 75 },
      { header: "Артикул", width: 170 },
      { header: "Категория", width: 70 },
      { header: "К-во", width: 45, align: "right" },
      { header: "М.е.", width: 30 },
      { header: "Доставна цена", width: 60, align: "right" },
      { header: "Стойност", width: 60, align: "right", bold: true },
    ],
    rows.map((r) => {
      units += r.qty;
      value += r.qty * r.cost;
      return [r.sku, r.variant ? `${r.name} · ${r.variant}` : r.name, r.category ?? "—", formatNumber(r.qty), r.unit, formatMoney(r.cost, ctx.org.currency), formatMoney(r.qty * r.cost, ctx.org.currency)];
    }),
    { zebra: true },
  );
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font("bold").fontSize(10).text(`${rows.length} артикула · ${formatNumber(units)} единици · обща стойност ${formatMoney(value, ctx.org.currency)}`, doc.page.margins.left, doc.y, { width, align: "right" });
  pageNumbers(doc, `${ctx.org.name} · наличност към ${formatDate(now, "dd.MM.yyyy")}`);
  return pdfResponse(doc, `nalichnost-${formatDate(now, "yyyy-MM-dd")}.pdf`);
}
