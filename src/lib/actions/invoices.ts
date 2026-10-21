"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { invoices, partners } from "@/db/tenant-schema";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { localTodayIso } from "@/lib/dates";
import { optional, optionalInt, str } from "@/lib/forms";
import { invoiceFileName, invoicePdf } from "@/lib/invoice-pdf";
import { addPayment, cancelInvoice, createDraft, deleteDraft, draftFromOrder, draftNoteFor, issueInvoice, KIND_TITLES, saveDraft, type LineInput } from "@/lib/invoicing";
import { documentMail, sendMail } from "@/lib/mail";
import { parseMoney } from "@/lib/money";
import { setNextInvoiceNumber } from "@/lib/numbering";
import { MAX_DECIMALS, parseQuantity } from "@/lib/quantity";
import { getInvoice } from "@/lib/queries";
import { getCompanyDetails } from "@/lib/settings";
import { formatDate, formatMoney } from "@/lib/utils";
import { emit } from "@/lib/webhooks";
import { act, redirectWith } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { assertWithinLimit } from "@/lib/plans";

function revalidate(id?: number, orderId?: number | null) {
  revalidatePath("/invoices");
  if (id) revalidatePath(`/invoices/${id}`);
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

const isoDate = (fd: FormData, key: string) => {
  const v = optional(fd, key);
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new UserError("Невалидна дата.");
  return v;
};

function readLines(fd: FormData): LineInput[] {
  const items = fd.getAll("lineItemId").map(String);
  const orderLineIds = fd.getAll("lineOrderLineId").map(String);
  const descriptions = fd.getAll("lineDescription").map(String);
  const qtys = fd.getAll("lineQuantity").map(String);
  const units = fd.getAll("lineUnit").map(String);
  const prices = fd.getAll("linePrice").map(String);
  const vats = fd.getAll("lineVatRateId").map(String);
  return descriptions.map((description, i) => ({
    itemId: Number(items[i]) > 0 ? Number(items[i]) : null,
    orderLineId: Number(orderLineIds[i]) > 0 ? Number(orderLineIds[i]) : null,
    description,
    quantity: parseQuantity(qtys[i], MAX_DECIMALS, `Ред ${i + 1}: количество`),
    unit: units[i]?.trim() || "бр.",
    unitPrice: parseMoney(prices[i], `Ред ${i + 1}: цена`),
    vatRateId: Number(vats[i]) > 0 ? Number(vats[i]) : null,
  }));
}

export const newInvoice = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const kind = str(fd, "kind") === "proforma" ? "proforma" : "invoice";
  const id = await createDraft(ctx.db, { kind, partnerId: optionalInt(fd, "partnerId"), currency: ctx.org.currency, lines: [] }, ctx.user.name);
  await audit(ctx, "create", "invoice", id, { kind });
  revalidate(id);
  return redirectWith(`/invoices/${id}`, "Черновата е създадена — добавете редовете.");
});

export const invoiceFromOrder = act(async (orderId: number, kind: "invoice" | "proforma") => {
  const ctx = await requireContext("write");
  const id = await draftFromOrder(ctx.db, orderId, ctx.org.currency, ctx.user.name, kind);
  await audit(ctx, "create", "invoice", id, { kind, orderId });
  revalidate(id, orderId);
  return redirectWith(`/invoices/${id}`, `${KIND_TITLES[kind]}: черновата е създадена от поръчката.`);
});

export const noteForInvoice = act(async (invoiceId: number, kind: "credit_note" | "debit_note") => {
  const ctx = await requireContext("write");
  const id = await draftNoteFor(ctx.db, invoiceId, kind, ctx.user.name);
  await audit(ctx, "create", "invoice", id, { kind, relatedInvoiceId: invoiceId });
  revalidate(id);
  return redirectWith(`/invoices/${id}`, `${KIND_TITLES[kind]}: коригирайте редовете и основанието, после издайте.`);
});

export const saveInvoiceDraft = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("write");
  await saveDraft(
    ctx.db,
    id,
    { partnerId: optionalInt(fd, "partnerId"), issueDate: isoDate(fd, "issueDate"), taxEventDate: isoDate(fd, "taxEventDate"), dueDate: isoDate(fd, "dueDate"), paymentMethod: optional(fd, "paymentMethod"), notes: optional(fd, "notes"), reason: optional(fd, "reason") },
    readLines(fd),
  );
  revalidate(id);
  return "Черновата е запазена.";
});

export const issueInvoiceAction = act(async (id: number) => {
  const ctx = await requireContext("write");
  const [draft] = await ctx.db.select({ kind: invoices.kind }).from(invoices).where(eq(invoices.id, id));
  if (draft && draft.kind !== "proforma") await assertWithinLimit(ctx, "invoices");
  const r = await issueInvoice(ctx.db, id, ctx.user);
  await audit(ctx, "status", "invoice", id, { number: r.number, kind: r.kind, status: "issued", grossTotal: r.grossTotal });
  emit(ctx.db, "invoice.issued", { id, kind: r.kind, number: r.number, orderId: r.orderId, grossTotal: r.grossTotal, currency: ctx.org.currency });
  revalidate(id, r.orderId);
  return `${KIND_TITLES[r.kind]} № ${r.number} е издадена.`;
});

export const cancelInvoiceAction = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("delete");
  await cancelInvoice(ctx.db, id, str(fd, "reason"));
  await audit(ctx, "status", "invoice", id, { status: "cancelled", reason: str(fd, "reason") });
  revalidate(id);
  return "Документът е анулиран; номерът остава зает.";
});

export const deleteInvoiceDraft = act(async (id: number) => {
  const ctx = await requireContext("write");
  await deleteDraft(ctx.db, id);
  await audit(ctx, "delete", "invoice", id);
  revalidate();
  return redirectWith("/invoices", "Черновата е изтрита.");
});

export const addInvoicePayment = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const r = await addPayment(ctx.db, id, { paidOn: isoDate(fd, "paidOn") ?? localTodayIso(), amount: parseMoney(str(fd, "amount"), "Сума"), method: optional(fd, "method"), note: optional(fd, "note") }, ctx.user.name);
  await audit(ctx, "update", "invoice", id, { payment: str(fd, "amount"), paymentStatus: r.status });
  if (r.becamePaid) emit(ctx.db, "invoice.paid", { id, number: r.number, paidAmount: r.paid, paymentStatus: r.status });
  revalidate(id);
  return r.status === "paid" ? "Фактурата е изцяло платена." : `Плащането е записано. Остават ${formatMoney(r.due - r.paid, ctx.org.currency)}.`;
});

/** Изпраща документа като PDF до имейла на получателя (или до въведен адрес). */
export const emailInvoice = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const inv = await getInvoice(ctx.db, id);
  if (!inv || inv.status !== "issued") throw new UserError("Изпраща се само издаден документ.");
  const partner = inv.partnerId ? await ctx.db.query.partners.findFirst({ where: eq(partners.id, inv.partnerId) }) : null;
  const to = str(fd, "to") || partner?.email || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new UserError("Въведете имейл на получателя.");
  const company = await getCompanyDetails(ctx.db);
  const pdf = await invoicePdf({ invoice: inv, company, partner: partner ?? null, orgName: ctx.org.name });
  const title = `${KIND_TITLES[inv.kind]} № ${inv.number} от ${formatDate(inv.issueDate, "dd.MM.yyyy")}`;
  await sendMail(
    documentMail({
      to,
      orgName: company.legalName || ctx.org.name,
      title,
      replyTo: ctx.user.email,
      lines: [`Здравейте,`, `Изпращаме Ви ${title} за ${formatMoney(inv.grossTotal, inv.currency)}${inv.dueDate ? ` с падеж ${formatDate(inv.dueDate, "dd.MM.yyyy")}` : ""}.`],
      attachment: { filename: invoiceFileName(inv), content: pdf },
    }),
  );
  await audit(ctx, "update", "invoice", id, { emailedTo: to });
  return `Документът е изпратен до ${to}.`;
});

export const saveNextInvoiceNumber = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const [issued] = await ctx.db.select({ id: invoices.id }).from(invoices).where(eq(invoices.status, "issued")).limit(1);
  if (issued) throw new UserError("Номерацията се задава само преди първата издадена фактура.");
  const next = Number(str(fd, "next"));
  if (!Number.isInteger(next) || next < 1 || next > 9_999_999_999) throw new UserError("Следващият номер е цяло число от 1 до 9999999999.");
  await setNextInvoiceNumber(ctx.db, next);
  await audit(ctx, "update", "settings", null, { nextInvoiceNumber: next });
  revalidate();
  return `Следващата фактура ще е № ${String(next).padStart(10, "0")}.`;
});
