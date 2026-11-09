import "server-only";
/**
 * Каса и банка, салда по партньори и плащане по много документи наведнъж.
 *
 * Салдо на клиент = издадени фактури и дебитни известия − кредитни известия
 *                 + изпълнени продажби без фактура (стокова разписка)
 *                 − платеното (по фактури, по поръчки и аванси).
 * Салдо на доставчик = получена стока по поръчки за доставка − плащанията към него.
 * Положително = дължи ни (клиент) / дължим му (доставчик).
 */
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/tenant";
import { cashAccounts, cashEntries, invoiceLines, invoices, orders, partners, type CashDirection } from "@/db/tenant-schema";
import { localTodayIso } from "./dates";
import { UserError } from "./errors";
import { sumMoney } from "./money";
import { nextNumber } from "./numbering";
import { addQty, subQty } from "./quantity";
import { orderVat } from "./vat";
import { toBase } from "./fx";

type Actor = { id: number; name: string } | null;

/** Записи, които важат за салдата: без сторнираните и без самите сторна. */
const live = () => and(isNull(cashEntries.reversalOfId), isNull(cashEntries.reversedAt));

export const CASH_CATEGORIES = {
  in: ["Плащане от клиент", "Аванс от клиент", "Внасяне в касата", "Друг приход"],
  out: ["Плащане към доставчик", "Аванс към доставчик", "Разход", "Теглене от касата", "Друг разход"],
} as const;

/** Каса и банка по подразбиране — създават се при първото плащане. */
export async function ensureAccounts(db: Db) {
  const rows = await db.select().from(cashAccounts).orderBy(asc(cashAccounts.id));
  if (rows.length > 0) return rows;
  await db.insert(cashAccounts).values([
    { name: "Каса", kind: "cash", isDefault: true },
    { name: "Банка", kind: "bank" },
  ]);
  return db.select().from(cashAccounts).orderBy(asc(cashAccounts.id));
}

/** Сметката за плащане: изрично избрана; иначе по метода (превод/карта → банка), иначе касата по подразбиране. */
export async function resolveAccount(db: Db, accountId?: number | null, method?: string | null) {
  const accounts = await ensureAccounts(db);
  if (accountId) {
    const a = accounts.find((x) => x.id === accountId);
    if (!a) throw new UserError("Сметката не е намерена.");
    return a;
  }
  const wantsBank = method ? /банк|превод|карт|bank|card|pos/i.test(method) : false;
  const active = accounts.filter((a) => a.active);
  return (wantsBank ? active.find((a) => a.kind === "bank") : undefined) ?? active.find((a) => a.isDefault) ?? active.find((a) => a.kind === "cash") ?? active[0] ?? accounts[0];
}

export type CashEntryInput = {
  direction: CashDirection;
  entryDate?: string;
  accountId?: number | null;
  method?: string | null;
  amount: number;
  partnerId?: number | null;
  invoiceId?: number | null;
  orderId?: number | null;
  invoicePaymentId?: number | null;
  category?: string | null;
  note?: string | null;
};

/** Запис в касовата книга (в транзакцията на извикващия); касовите записи вземат номер ПКО/РКО. */
export async function recordCashEntry(tx: Db, actor: Actor, input: CashEntryInput) {
  if (!(input.amount > 0)) throw new UserError("Сумата трябва да е положителна.");
  const account = await resolveAccount(tx, input.accountId, input.method);
  if (!account.active && !input.accountId) throw new UserError("Няма активна каса или сметка.");
  const number = account.kind === "cash" ? await nextNumber(tx, input.direction === "in" ? "cashIn" : "cashOut") : null;
  const [row] = await tx
    .insert(cashEntries)
    .values({
      number,
      direction: input.direction,
      entryDate: input.entryDate ?? localTodayIso(),
      accountId: account.id,
      amount: input.amount,
      partnerId: input.partnerId ?? null,
      invoiceId: input.invoiceId ?? null,
      orderId: input.orderId ?? null,
      invoicePaymentId: input.invoicePaymentId ?? null,
      category: input.category ?? null,
      note: input.note ?? null,
      createdBy: actor?.id ?? null,
      createdByName: actor?.name ?? null,
    })
    .$returningId();
  return { id: row.id, number, account };
}

/** Наличност по сметки: постъпления − плащания. */
export async function accountBalances(db: Db) {
  const accounts = await ensureAccounts(db);
  const sums = await db
    .select({
      accountId: cashEntries.accountId,
      inflow: sql<string>`coalesce(sum(case when ${cashEntries.direction} = 'in' then ${cashEntries.amount} else 0 end), 0)`,
      outflow: sql<string>`coalesce(sum(case when ${cashEntries.direction} = 'out' then ${cashEntries.amount} else 0 end), 0)`,
    })
    .from(cashEntries)
    .groupBy(cashEntries.accountId);
  return accounts.map((a) => {
    const s = sums.find((x) => x.accountId === a.id);
    const inflow = Number(s?.inflow ?? 0);
    const outflow = Number(s?.outflow ?? 0);
    return { ...a, inflow, outflow, balance: sumMoney([inflow, -outflow]) };
  });
}

// -------------------------------------------------------------------- салда

type OrderValue = { id: number; number: string; type: "purchase" | "sales"; partnerId: number | null; date: string | null; delivered: number };

/**
 * Стойност с ДДС на изпълненото по поръчки (минус върнатото). За продажбите — само нефактурираната част
 * (фактурираното е вземане по фактурата): доставено − върнато − фактурирано по ред, както при фактуриране.
 */
async function deliveredOrders(db: Db, partnerIds?: number[]) {
  const where = and(inArray(orders.status, ["confirmed", "partial", "completed"]), partnerIds ? inArray(orders.partnerId, partnerIds) : undefined);
  const rows = (await db.query.orders.findMany({ where, with: { lines: true } })).filter((o) => o.partnerId);
  const salesLineIds = rows.filter((o) => o.type === "sales").flatMap((o) => o.lines.map((l) => l.id));
  const invoiced = new Map<number, number>();
  if (salesLineIds.length) {
    const inv = await db
      .select({ orderLineId: invoiceLines.orderLineId, quantity: invoiceLines.quantity, kind: invoices.kind })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .where(and(inArray(invoiceLines.orderLineId, salesLineIds), eq(invoices.status, "issued"), ne(invoices.kind, "proforma")));
    for (const r of inv) {
      if (r.orderLineId === null || r.kind === "debit_note") continue;
      invoiced.set(r.orderLineId, (r.kind === "credit_note" ? subQty : addQty)(invoiced.get(r.orderLineId) ?? 0, r.quantity));
    }
  }
  const out: OrderValue[] = [];
  for (const o of rows) {
    const lines = o.lines.map((l) => {
      const net = subQty(l.fulfilledQuantity, l.returnedQuantity);
      const quantity = o.type === "sales" ? subQty(net, invoiced.get(l.id) ?? 0) : net;
      return { quantity: Math.max(0, quantity), unitPrice: l.unitPrice, vatRate: l.vatRate };
    });
    const delivered = toBase(orderVat(o, lines).gross, o, 2); // салдата са в основната валута
    if (delivered > 0) out.push({ id: o.id, number: o.number, type: o.type, partnerId: o.partnerId, date: o.orderDate, delivered });
  }
  return out;
}

export type PartnerBalance = {
  partnerId: number;
  /** Вземане от клиента. */
  receivable: number;
  /** Задължение към доставчика. */
  payable: number;
  invoiced: number;
  deliveredWithoutInvoice: number;
  receivedFromSupplier: number;
  paidIn: number;
  paidOut: number;
  overdueInvoices: number;
};

/** Салда на всички (или избрани) партньори в няколко заявки. */
export async function partnerBalances(db: Db, partnerIds?: number[]): Promise<Map<number, PartnerBalance>> {
  const today = localTodayIso();
  const invRows = await db
    .select({ partnerId: invoices.partnerId, kind: invoices.kind, gross: invoices.grossTotal, paid: invoices.paidAmount, dueDate: invoices.dueDate, paymentStatus: invoices.paymentStatus })
    .from(invoices)
    .where(and(eq(invoices.status, "issued"), inArray(invoices.kind, ["invoice", "debit_note", "credit_note"]), partnerIds ? inArray(invoices.partnerId, partnerIds) : undefined));
  // плащанията по фактури са в invoices.paid_amount; тук — само тези без фактура (по поръчка или аванс)
  const cashRows = await db
    .select({ partnerId: cashEntries.partnerId, direction: cashEntries.direction, amount: sql<string>`sum(${cashEntries.amount})` })
    .from(cashEntries)
    .where(and(isNull(cashEntries.invoiceId), live(), partnerIds ? inArray(cashEntries.partnerId, partnerIds) : undefined))
    .groupBy(cashEntries.partnerId, cashEntries.direction);
  const ordersDelivered = await deliveredOrders(db, partnerIds);

  const map = new Map<number, PartnerBalance>();
  const get = (id: number) => {
    let b = map.get(id);
    if (!b) map.set(id, (b = { partnerId: id, receivable: 0, payable: 0, invoiced: 0, deliveredWithoutInvoice: 0, receivedFromSupplier: 0, paidIn: 0, paidOut: 0, overdueInvoices: 0 }));
    return b;
  };
  for (const r of invRows) {
    if (!r.partnerId) continue;
    const b = get(r.partnerId);
    b.invoiced = sumMoney([b.invoiced, r.kind === "credit_note" ? -r.gross : r.gross]);
    b.paidIn = sumMoney([b.paidIn, r.paid]);
    if (r.kind !== "credit_note" && r.paymentStatus !== "paid" && r.dueDate && r.dueDate < today) b.overdueInvoices++;
  }
  for (const o of ordersDelivered) {
    const b = get(o.partnerId!);
    if (o.type === "sales") b.deliveredWithoutInvoice = sumMoney([b.deliveredWithoutInvoice, o.delivered]);
    else b.receivedFromSupplier = sumMoney([b.receivedFromSupplier, o.delivered]);
  }
  for (const c of cashRows) {
    if (!c.partnerId) continue;
    const b = get(c.partnerId);
    if (c.direction === "in") b.paidIn = sumMoney([b.paidIn, Number(c.amount)]);
    else b.paidOut = sumMoney([b.paidOut, Number(c.amount)]);
  }
  for (const b of map.values()) {
    b.receivable = sumMoney([b.invoiced, b.deliveredWithoutInvoice, -b.paidIn]);
    b.payable = sumMoney([b.receivedFromSupplier, -b.paidOut]);
  }
  return map;
}

export async function partnerBalance(db: Db, partnerId: number) {
  return (await partnerBalances(db, [partnerId])).get(partnerId) ?? { partnerId, receivable: 0, payable: 0, invoiced: 0, deliveredWithoutInvoice: 0, receivedFromSupplier: 0, paidIn: 0, paidOut: 0, overdueInvoices: 0 };
}

export type OpenDocument = { kind: "invoice" | "order"; id: number; number: string; date: string | null; dueDate: string | null; total: number; paid: number; open: number };

/** Неплатените документи на партньора, най-старите първи (редът на разпределяне на плащане). */
export async function openDocuments(db: Db, partnerId: number, direction: CashDirection): Promise<OpenDocument[]> {
  const docs: OpenDocument[] = [];
  if (direction === "in") {
    const inv = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.partnerId, partnerId), eq(invoices.status, "issued"), inArray(invoices.kind, ["invoice", "debit_note"]), inArray(invoices.paymentStatus, ["unpaid", "partial"])))
      .orderBy(asc(invoices.dueDate), asc(invoices.issueDate), asc(invoices.id));
    for (const i of inv) {
      // кредитните известия намаляват дължимото по фактурата
      const [credit] = await db
        .select({ n: sql<string>`coalesce(sum(${invoices.grossTotal}), 0)` })
        .from(invoices)
        .where(and(eq(invoices.relatedInvoiceId, i.id), eq(invoices.status, "issued"), eq(invoices.kind, "credit_note")));
      const total = sumMoney([i.grossTotal, -Number(credit.n)]);
      const open = sumMoney([total, -i.paidAmount]);
      if (open > 0) docs.push({ kind: "invoice", id: i.id, number: i.number ?? "чернова", date: i.issueDate, dueDate: i.dueDate, total, paid: i.paidAmount, open });
    }
  }
  const delivered = (await deliveredOrders(db, [partnerId])).filter((o) => o.type === (direction === "in" ? "sales" : "purchase"));
  if (delivered.length) {
    const paid = await db
      .select({ orderId: cashEntries.orderId, n: sql<string>`sum(${cashEntries.amount})` })
      .from(cashEntries)
      .where(and(inArray(cashEntries.orderId, delivered.map((o) => o.id)), eq(cashEntries.direction, direction), live()))
      .groupBy(cashEntries.orderId);
    for (const o of delivered.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id - b.id)) {
      const p = Number(paid.find((x) => x.orderId === o.id)?.n ?? 0);
      const open = sumMoney([o.delivered, -p]);
      if (open > 0) docs.push({ kind: "order", id: o.id, number: o.number, date: o.date, dueDate: null, total: o.delivered, paid: p, open });
    }
  }
  return docs;
}

/** Платеното по поръчка (без фактура) — за страницата на поръчката. */
export async function orderPaid(db: Db, orderId: number) {
  const [row] = await db.select({ n: sql<string>`coalesce(sum(${cashEntries.amount}), 0)` }).from(cashEntries).where(and(eq(cashEntries.orderId, orderId), live()));
  return Number(row.n);
}

export async function pageCashEntries(db: Db, f: { accountId?: number | null; direction?: CashDirection | null; from?: string | null; to?: string | null; partnerId?: number | null }, page: number, pageSize = 50) {
  const where = and(
    f.accountId ? eq(cashEntries.accountId, f.accountId) : undefined,
    f.direction ? eq(cashEntries.direction, f.direction) : undefined,
    f.from ? sql`${cashEntries.entryDate} >= ${f.from}` : undefined,
    f.to ? sql`${cashEntries.entryDate} <= ${f.to}` : undefined,
    f.partnerId ? eq(cashEntries.partnerId, f.partnerId) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db.query.cashEntries.findMany({ where, with: { account: true, partner: true, invoice: true, order: true }, orderBy: [desc(cashEntries.entryDate), desc(cashEntries.id)], limit: pageSize, offset: (page - 1) * pageSize }),
    db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(cashEntries).where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function getPartnerName(db: Db, id: number) {
  const [p] = await db.select({ name: partners.name }).from(partners).where(eq(partners.id, id));
  return p?.name ?? null;
}


/** Сторно: обратен запис със същата сума (ново ПКО/РКО), оригиналът се маркира; по фактура — не. */
export async function reverseCashEntry(db: Db, actor: Actor, id: number) {
  return db.transaction(async (tx) => {
    const [e] = await tx.select().from(cashEntries).where(eq(cashEntries.id, id)).for("update");
    if (!e) throw new UserError("Записът не е намерен.");
    if (e.reversedAt || e.reversalOfId) throw new UserError("Записът вече е сторниран.");
    if (e.invoiceId) throw new UserError("Плащане по фактура се коригира с кредитно известие, не със сторно.");
    const r = await recordCashEntry(tx, actor, {
      direction: e.direction === "in" ? "out" : "in",
      accountId: e.accountId,
      amount: e.amount,
      partnerId: e.partnerId,
      orderId: e.orderId,
      category: "Сторно",
      note: `Сторно на ${e.number ?? `запис ${e.id}`}`,
    });
    await tx.update(cashEntries).set({ reversalOfId: e.id }).where(eq(cashEntries.id, r.id));
    await tx.update(cashEntries).set({ reversedAt: new Date() }).where(eq(cashEntries.id, e.id));
    return r;
  });
}
