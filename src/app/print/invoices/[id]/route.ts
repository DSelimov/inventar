import { eq } from "drizzle-orm";
import { partners } from "@/db/tenant-schema";
import { requireContext } from "@/lib/auth";
import { invoiceFileName, invoicePdf } from "@/lib/invoice-pdf";
import { pdfBytesResponse } from "@/lib/pdf";
import { getInvoice } from "@/lib/queries";
import { getCompanyDetails } from "@/lib/settings";

/** Фактура/известие/проформа като PDF. ?copy=1 — „Копие“. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("read");
  const id = Number((await params).id);
  const invoice = Number.isInteger(id) ? await getInvoice(ctx.db, id) : null;
  if (!invoice) return new Response("Документът не е намерен.", { status: 404 });
  const [company, partner] = await Promise.all([getCompanyDetails(ctx.db), invoice.partnerId ? ctx.db.query.partners.findFirst({ where: eq(partners.id, invoice.partnerId) }) : null]);
  const pdf = await invoicePdf({ invoice, company, partner: partner ?? null, orgName: ctx.org.name, copy: new URL(req.url).searchParams.get("copy") === "1" });
  return pdfBytesResponse(pdf, invoiceFileName(invoice));
}
