import { INVOICE_KINDS, INVOICE_STATUSES, PAYMENT_STATUSES, type InvoiceKind, type InvoiceStatus, type PaymentStatus } from "@/db/tenant-schema";
import { handler, json } from "@/lib/api";
import { localTodayIso } from "@/lib/dates";
import { pageInvoices } from "@/lib/queries";

const pick = <T extends string>(v: string | null, all: readonly T[]) => (v && (all as readonly string[]).includes(v) ? (v as T) : undefined);
const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export const GET = handler("read", async (req, ctx) => {
  const sp = new URL(req.url).searchParams;
  const payment = sp.get("payment");
  const r = await pageInvoices(
    ctx.db,
    {
      q: sp.get("q") || undefined,
      kind: pick<InvoiceKind>(sp.get("kind"), INVOICE_KINDS),
      status: pick<InvoiceStatus>(sp.get("status"), INVOICE_STATUSES),
      payment: payment === "overdue" ? "overdue" : pick<PaymentStatus>(payment, PAYMENT_STATUSES),
      from: isDate(sp.get("from")),
      to: isDate(sp.get("to")),
      partnerId: Number(sp.get("partnerId")) || undefined,
    },
    Math.max(1, Number(sp.get("page")) || 1),
    localTodayIso(),
  );
  return json({ data: r.rows.map((row) => row.invoice), page: r.page, pageSize: r.pageSize, total: r.total });
});
