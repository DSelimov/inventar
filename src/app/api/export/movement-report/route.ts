import { getContext } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { movementReport, readMovementReportFilters } from "@/lib/movement-report";

/** CSV на справката „Приход и разход за период“ със същите филтри като страницата (/reports/movements). */
export async function GET(req: Request) {
  const ctx = await getContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = readMovementReportFilters(sp, ctx.locations);
  const { rows } = await movementReport(ctx.db, f);
  const values = !ctx.hideCosts;
  // десетична запетая — български Excel чете числата като числа (разделителят е „;“)
  const n = (v: number) => String(v).replace(".", ",");
  const header = ["Категория", "Код", "Артикул", "Вариант", "М.е.", "Начално", "Получено", "Изписано", "Крайно", ...(values ? ["Стойност приход", "Стойност разход", "Крайна стойност"] : []), "Движения"];
  const csv = toCsv([
    header,
    ...rows.map((r) => [
      r.category ?? "Без категория",
      r.sku,
      r.name,
      r.variant,
      r.unit,
      n(r.openingQty),
      n(r.inQty),
      n(r.outQty),
      n(r.closingQty),
      ...(values ? [n(r.inValue), n(r.outValue), n(r.closingValue)] : []),
      r.moves,
    ]),
  ]);
  const name = f.from === f.to ? `prihod-razhod-${f.from}` : `prihod-razhod-${f.from}_${f.to}`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
}
