import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { invoiceLines, invoicePayments, invoices, orders, partners, type Invoice, type InvoiceKind, type InvoiceStatus, type PaymentStatus } from "@/db/tenant-schema";
import { localTodayIso } from "./dates";
import { UserError } from "./errors";
import { sumMoney } from "./money";
import { nextInvoiceNumber } from "./numbering";
import { addQty, subQty } from "./quantity";
import { getCompanyDetails, getSettings } from "./settings";
import { lineAmounts, vatSummary } from "./vat";
import { assignVat } from "./vat-rates";

/**
 * Фактуриране по ЗДДС. Черновата е свободна за редакция; „Издай“ заема номер, записва снимка на
 * доставчика, получателя и сумите и заключва документа. Кредитното/дебитното известие сочи фактурата
 * и основанието. Анулираният документ пази номера си.
 */

export const KIND_TITLES: Record<InvoiceKind, string> = { invoice: "Фактура", credit_note: "Кредитно известие", debit_note: "Дебитно известие", proforma: "Проформа фактура" };
/** Собствени етикети: „partial“/„cancelled“ в общите STATUS_LABELS значат друго (поръчки). */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = { draft: "Чернова", issued: "Издадена", cancelled: "Анулирана" };
export const PAYMENT_LABELS: Record<PaymentStatus, string> = { unpaid: "Неплатена", partial: "Частично платена", paid: "Платена" };
export const PAYMENT_TONES: Record<PaymentStatus, "warning" | "info" | "success"> = { unpaid: "warning", partial: "info", paid: "success" };

export type LineInput = { itemId?: number | null; orderLineId?: number | null; description: string; quantity: number; unit: string; unitPrice: number; vatRateId?: number | null };
export type HeaderInput = { partnerId?: number | null; issueDate?: string | null; taxEventDate?: string | null; dueDate?: string | null; paymentMethod?: string | null; notes?: string | null; reason?: string | null };

async function loadDraft(tx: Db, id: number) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
  if (!inv) throw new UserError("Документът не е намерен.");
  if (inv.status !== "draft") throw new UserError("Издаденият документ не се променя — използвайте кредитно или дебитно известие.");
  return inv;
}

/** Редовете с ДДС (избрана → артикул → категория → по подразбиране) и сумите им. */
async function priceLines(tx: Db, lines: LineInput[], pricesIncludeVat: boolean) {
  const clean = lines.filter((l) => l.description.trim() && l.quantity > 0);
  const withVat = await assignVat(tx, clean);
  return withVat.map((l, i) => {
    const a = lineAmounts(l.quantity, l.unitPrice, l.vatRate, pricesIncludeVat);
    return {
      itemId: l.itemId ?? null,
      orderLineId: l.orderLineId ?? null,
      description: l.description.trim().slice(0, 500),
      quantity: l.quantity,
      unit: l.unit || "бр.",
      unitPrice: l.unitPrice,
      vatRateId: l.vatRateId,
      vatRate: l.vatRate,
      legalBasis: l.legalBasis,
      netAmount: a.net,
      vatAmount: a.vat,
      grossAmount: a.gross,
      sortOrder: i,
    };
  });
}

async function writeLines(tx: Db, invoiceId: number, lines: LineInput[], pricesIncludeVat: boolean) {
  // изтриване по първичен ключ: DELETE по invoice_id заключва междините в индекса и паралелни чернови се блокират взаимно
  const existing = await tx.select({ id: invoiceLines.id }).from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  if (existing.length) await tx.delete(invoiceLines).where(inArray(invoiceLines.id, existing.map((l) => l.id)));
  const priced = await priceLines(tx, lines, pricesIncludeVat);
  if (priced.length) await tx.insert(invoiceLines).values(priced.map((l) => ({ ...l, invoiceId })));
  const sum = vatSummary(priced.map((l) => ({ vatRate: l.vatRate, netAmount: l.netAmount, vatAmount: l.vatAmount, grossAmount: l.grossAmount })));
  await tx.update(invoices).set({ netTotal: sum.net, vatTotal: sum.vat, grossTotal: sum.gross }).where(eq(invoices.id, invoiceId));
}

export async function createDraft(db: TenantDb, o: HeaderInput & { kind: InvoiceKind; orderId?: number | null; relatedInvoiceId?: number | null; lines?: LineInput[]; currency: string }, createdBy: string) {
  const settings = await getSettings(db);
  return db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(invoices)
      .values({
        kind: o.kind,
        partnerId: o.partnerId ?? null,
        orderId: o.orderId ?? null,
        relatedInvoiceId: o.relatedInvoiceId ?? null,
        reason: o.reason ?? null,
        currency: o.currency,
        pricesIncludeVat: settings.pricesIncludeVat,
        issueDate: o.issueDate ?? null,
        dueDate: o.dueDate ?? null,
        paymentMethod: o.paymentMethod ?? null,
        notes: o.notes ?? null,
        createdBy,
      })
      .$returningId();
    await writeLines(tx, id, o.lines ?? [], settings.pricesIncludeVat);
    return id;
  });
}

/** Колко е фактурирано по всеки ред на поръчката (издадени фактури и дебитни минус кредитни известия). */
export async function invoicedByOrderLine(db: Db, orderId: number) {
  const rows = await db
    .select({ orderLineId: invoiceLines.orderLineId, quantity: invoiceLines.quantity, kind: invoices.kind })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
    .where(and(eq(invoices.orderId, orderId), eq(invoices.status, "issued"), ne(invoices.kind, "proforma")));
  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.orderLineId === null || r.kind === "debit_note") continue; // дебитното известие коригира цена, не количество
    map.set(r.orderLineId, (r.kind === "credit_note" ? subQty : addQty)(map.get(r.orderLineId) ?? 0, r.quantity));
  }
  return map;
}

/**
 * Чернова от клиентска поръчка: доставеното минус върнатото минус вече фактурираното; ако нищо не е
 * доставено (авансово плащане) — поръчаното минус фактурираното.
 */
export async function draftFromOrder(db: TenantDb, orderId: number, currency: string, createdBy: string, kind: "invoice" | "proforma" = "invoice") {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { lines: { with: { item: true } } } });
  if (!order) throw new UserError("Поръчката не е намерена.");
  if (order.type !== "sales") throw new UserError("Фактури се издават по клиентски поръчки.");
  const invoiced = kind === "proforma" ? new Map<number, number>() : await invoicedByOrderLine(db, orderId);
  const delivered = order.lines.some((l) => l.fulfilledQuantity > 0);
  const lines = order.lines
    .map((l) => {
      const base = delivered ? subQty(l.fulfilledQuantity, l.returnedQuantity) : l.quantity;
      return {
        itemId: l.itemId,
        orderLineId: l.id,
        description: l.item.variantLabel ? `${l.item.name} · ${l.item.variantLabel}` : l.item.name,
        quantity: Math.max(0, subQty(base, invoiced.get(l.id) ?? 0)),
        unit: l.item.unit,
        unitPrice: l.unitPrice,
        vatRateId: l.vatRateId,
      };
    })
    .filter((l) => l.quantity > 0);
  if (!lines.length) throw new UserError("Всичко по поръчката вече е фактурирано.");
  const id = await createDraft(db, { kind, orderId, partnerId: order.partnerId, currency, lines }, createdBy);
  // цените на поръчката са с/без ДДС според нея, не според текущата настройка
  await db.transaction(async (tx) => {
    await tx.update(invoices).set({ pricesIncludeVat: order.pricesIncludeVat }).where(eq(invoices.id, id));
    await writeLines(tx, id, lines, order.pricesIncludeVat);
  });
  return id;
}

/** Чернова на известие към издадена фактура: редовете ѝ, които се коригират в черновата. */
export async function draftNoteFor(db: TenantDb, invoiceId: number, kind: "credit_note" | "debit_note", createdBy: string) {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId), with: { lines: true } });
  if (!inv || inv.kind !== "invoice" || inv.status !== "issued") throw new UserError("Известие се издава само към издадена фактура.");
  const id = await createDraft(
    db,
    { kind, relatedInvoiceId: inv.id, orderId: inv.orderId, partnerId: inv.partnerId, currency: inv.currency, reason: kind === "credit_note" ? "Връщане на стока" : "Корекция на цена", lines: inv.lines.map((l) => ({ ...l })) },
    createdBy,
  );
  await db.transaction(async (tx) => {
    await tx.update(invoices).set({ pricesIncludeVat: inv.pricesIncludeVat }).where(eq(invoices.id, id));
    await writeLines(tx, id, inv.lines.map((l) => ({ ...l })), inv.pricesIncludeVat);
  });
  return id;
}

export async function saveDraft(db: TenantDb, id: number, header: HeaderInput, lines: LineInput[]) {
  await db.transaction(async (tx) => {
    const inv = await loadDraft(tx, id);
    await tx
      .update(invoices)
      .set({ partnerId: header.partnerId ?? null, issueDate: header.issueDate ?? null, taxEventDate: header.taxEventDate ?? null, dueDate: header.dueDate ?? null, paymentMethod: header.paymentMethod ?? null, notes: header.notes ?? null, reason: header.reason ?? inv.reason })
      .where(eq(invoices.id, id));
    await writeLines(tx, id, lines, inv.pricesIncludeVat);
  });
}

/** Издаване: проверки по ЗДДС, номер, снимка на страните и сумите. */
export async function issueInvoice(db: TenantDb, id: number, actor: { name: string }) {
  const company = await getCompanyDetails(db);
  return db.transaction(async (tx) => {
    const inv = await loadDraft(tx, id);
    const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    if (!lines.length) throw new UserError("Документът няма редове.");
    if (!company.legalName || !company.eik || !company.address) throw new UserError("Попълнете юридическото име, ЕИК и адреса на фирмата (Настройки › Данни за документи).");
    const partner = inv.partnerId ? await tx.query.partners.findFirst({ where: eq(partners.id, inv.partnerId) }) : null;
    if (!partner) throw new UserError("Изберете получател (партньор).");
    if (inv.kind !== "proforma" && !partner.address) throw new UserError(`Попълнете адреса на „${partner.name}“ — задължителен е за фактурата.`);
    if (!company.vatNumber && lines.some((l) => l.vatRate > 0)) throw new UserError("Фирмата няма ДДС номер: използвайте ставка „Без ДДС“ (чл. 113, ал. 9 ЗДДС) или попълнете ДДС номера.");
    const missingBasis = lines.find((l) => l.vatRate === 0 && !l.legalBasis);
    if (missingBasis) throw new UserError(`„${missingBasis.description}“: при 0 % е нужно основание (Настройки › ДДС).`);
    let related: Invoice | undefined;
    if (inv.kind === "credit_note" || inv.kind === "debit_note") {
      [related] = inv.relatedInvoiceId ? await tx.select().from(invoices).where(eq(invoices.id, inv.relatedInvoiceId)) : [];
      if (!related || related.status !== "issued") throw new UserError("Известието трябва да е към издадена фактура.");
      if (!inv.reason?.trim()) throw new UserError("Въведете основание за известието.");
    }

    const issueDate = inv.issueDate ?? localTodayIso();
    const number = await nextInvoiceNumber(tx, inv.kind);
    const sum = vatSummary(lines);
    await tx
      .update(invoices)
      .set({
        number,
        status: "issued",
        issueDate,
        taxEventDate: inv.taxEventDate ?? issueDate,
        supplierName: company.legalName,
        supplierEik: company.eik,
        supplierVatNumber: company.vatNumber || null,
        supplierAddress: company.address,
        supplierMol: company.mol || null,
        recipientName: partner.name,
        recipientEik: partner.eik,
        recipientVatNumber: partner.vatNumber,
        recipientAddress: partner.address,
        recipientCountry: partner.country,
        recipientMol: partner.contactName,
        netTotal: sum.net,
        vatTotal: sum.vat,
        grossTotal: sum.gross,
        issuedAt: new Date(),
        issuedBy: actor.name,
      })
      .where(eq(invoices.id, id));
    // кредитното известие намалява неплатеното по фактурата
    if (inv.kind === "credit_note" && related) await refreshPaymentStatus(tx, related.id);
    return { number, kind: inv.kind, grossTotal: sum.gross, orderId: inv.orderId };
  });
}

/** Анулиране: номерът се запазва, документът не важи. */
export async function cancelInvoice(db: TenantDb, id: number, reason: string) {
  if (!reason.trim()) throw new UserError("Въведете причина за анулирането.");
  const [res] = await db.update(invoices).set({ status: "cancelled", cancelledAt: new Date(), reason: reason.trim().slice(0, 500) }).where(and(eq(invoices.id, id), eq(invoices.status, "issued")));
  if (res.affectedRows !== 1) throw new UserError("Анулира се само издаден документ.");
}

export async function deleteDraft(db: TenantDb, id: number) {
  const [res] = await db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.status, "draft")));
  if (res.affectedRows !== 1) throw new UserError("Изтрива се само чернова.");
}

/** Дължимото по фактура = общото минус издадените кредитни известия плюс дебитните. */
export async function amountDue(db: Db, invoiceId: number) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return 0;
  const notes = await db.select().from(invoices).where(and(eq(invoices.relatedInvoiceId, invoiceId), eq(invoices.status, "issued"), inArray(invoices.kind, ["credit_note", "debit_note"])));
  return sumMoney([inv.grossTotal, ...notes.map((n) => (n.kind === "credit_note" ? -n.grossTotal : n.grossTotal))]);
}

async function refreshPaymentStatus(tx: Db, invoiceId: number) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  const due = await amountDue(tx, invoiceId);
  const status = inv.paidAmount <= 0 ? (due <= 0 ? "paid" : "unpaid") : inv.paidAmount >= due ? "paid" : "partial";
  await tx.update(invoices).set({ paymentStatus: status }).where(eq(invoices.id, invoiceId));
  return { status, due, paid: inv.paidAmount };
}

export async function addPayment(db: TenantDb, invoiceId: number, p: { paidOn: string; amount: number; method?: string | null; note?: string | null }, createdBy: string) {
  if (!(p.amount > 0)) throw new UserError("Сумата на плащането трябва да е положителна.");
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!inv || inv.status !== "issued" || (inv.kind !== "invoice" && inv.kind !== "debit_note")) throw new UserError("Плащане се отбелязва по издадена фактура.");
    const before = inv.paymentStatus;
    await tx.insert(invoicePayments).values({ invoiceId, paidOn: p.paidOn, amount: p.amount, method: p.method ?? null, note: p.note ?? null, createdBy });
    await tx.update(invoices).set({ paidAmount: sumMoney([inv.paidAmount, p.amount]) }).where(eq(invoices.id, invoiceId));
    const after = await refreshPaymentStatus(tx, invoiceId);
    return { ...after, becamePaid: before !== "paid" && after.status === "paid", number: inv.number };
  });
}
