"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CASH_ACCOUNT_KINDS, CASH_DIRECTIONS, cashAccounts, cashEntries } from "@/db/tenant-schema";
import { act } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { recordCashEntry, reverseCashEntry } from "@/lib/cash";
import { localTodayIso } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { bool, oneOf, optional, optionalInt, required, str } from "@/lib/forms";
import { parseMoney } from "@/lib/money";
import { payPartner } from "@/lib/partner-payments";
import { formatMoney } from "@/lib/utils";

const isoDate = (fd: FormData, key: string) => {
  const v = str(fd, key);
  if (!v) return localTodayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new UserError("Невалидна дата.");
  return v;
};

function revalidate(partnerId?: number | null) {
  revalidatePath("/cash");
  revalidatePath("/reports/balances");
  revalidatePath("/invoices");
  if (partnerId) revalidatePath(`/partners/${partnerId}`);
}

export const createCashAccount = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  const [row] = await ctx.db.insert(cashAccounts).values({ name, kind: oneOf(fd, "kind", CASH_ACCOUNT_KINDS, "cash"), iban: optional(fd, "iban") }).$returningId();
  await audit(ctx, "create", "cash_account", row.id, { name });
  revalidate();
  return "Сметката е добавена.";
});

export const updateCashAccount = act(async (id: number, fd: FormData) => {
  const ctx = await requireContext("manage");
  const name = required(str(fd, "name"), "Име");
  const isDefault = bool(fd, "isDefault");
  await ctx.db.transaction(async (tx) => {
    if (isDefault) await tx.update(cashAccounts).set({ isDefault: false });
    await tx.update(cashAccounts).set({ name, iban: optional(fd, "iban"), active: bool(fd, "active") || isDefault, isDefault }).where(eq(cashAccounts.id, id));
  });
  await audit(ctx, "update", "cash_account", id, { name });
  revalidate();
  return "Сметката е запазена.";
});

/** Ръчен запис: приход/разход в касата или банката (с партньор — аванс/плащане без документ). */
export const addCashEntry = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const direction = oneOf(fd, "direction", CASH_DIRECTIONS, "in");
  const partnerId = optionalInt(fd, "partnerId");
  const accountId = optionalInt(fd, "accountId");
  if (accountId) {
    const [acc] = await ctx.db.select().from(cashAccounts).where(eq(cashAccounts.id, accountId));
    if (!acc?.active) throw new UserError("Сметката не е активна.");
  }
  const r = await ctx.db.transaction((tx) =>
    recordCashEntry(tx, ctx.user, {
      direction,
      entryDate: isoDate(fd, "entryDate"),
      accountId,
      amount: parseMoney(str(fd, "amount"), "Сума"),
      partnerId,
      category: optional(fd, "category"),
      note: optional(fd, "note"),
    }),
  );
  await audit(ctx, "create", "cash_entry", r.id, { number: r.number, direction, amount: str(fd, "amount") });
  revalidate(partnerId);
  return r.number ? `Записан е ${r.number}.` : "Записано е.";
});

export const reverseCashEntryAction = act(async (id: number) => {
  const ctx = await requireContext("manage");
  const [e] = await ctx.db.select({ partnerId: cashEntries.partnerId, number: cashEntries.number }).from(cashEntries).where(eq(cashEntries.id, id));
  const r = await reverseCashEntry(ctx.db, ctx.user, id);
  await audit(ctx, "update", "cash_entry", id, { reversed: e?.number ?? id, by: r.number });
  revalidate(e?.partnerId);
  return `Записът е сторниран${r.number ? ` с ${r.number}` : ""}.`;
});

/** Плащане от/към партньор по всички негови неплатени документи (най-старите първи), остатъкът е аванс. */
export const payPartnerAction = act(async (partnerId: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const direction = oneOf(fd, "direction", CASH_DIRECTIONS, "in");
  const amount = parseMoney(str(fd, "amount"), "Сума");
  const allocations = await payPartner(ctx.db, ctx.user, { partnerId, direction, amount, date: isoDate(fd, "date"), accountId: optionalInt(fd, "accountId"), note: optional(fd, "note") });
  await audit(ctx, "create", "cash_entry", null, { partnerId, direction, amount, allocations: allocations.map((a) => `${a.kind}:${a.number ?? "аванс"}:${a.amount}`) });
  revalidate(partnerId);
  const docs = allocations.filter((a) => a.kind !== "advance").map((a) => a.number);
  const advance = allocations.find((a) => a.kind === "advance");
  return [docs.length ? `Платени: ${docs.join(", ")}.` : null, advance ? `Аванс ${formatMoney(advance.amount, ctx.org.currency)}.` : null].filter(Boolean).join(" ") || "Записано.";
});

