"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { locations } from "@/db/tenant-schema";
import { act, redirectWith } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { bool, int, oneOf, optional, optionalInt, str } from "@/lib/forms";
import { addLotLine, applyStockCount, cancelStockCount, createStockCount, recordCount, saveCountedValues } from "@/lib/stock-count";
import { formatMoney } from "@/lib/utils";
import { MAX_DECIMALS, parseQuantity } from "@/lib/quantity";

const revalidate = (id?: number) => {
  revalidatePath("/counts");
  if (id) revalidatePath(`/counts/${id}`);
};

export const startStockCount = act(async (fd: FormData) => {
  const ctx = await requireContext("write");
  const locationId = int(fd, "locationId", 0);
  const location = await ctx.db.query.locations.findFirst({ where: eq(locations.id, locationId) });
  if (!location) throw new UserError("Изберете локация.");
  const r = await createStockCount(ctx.db, { locationId, categoryId: optionalInt(fd, "categoryId"), includeZero: bool(fd, "includeZero"), notes: optional(fd, "notes"), createdBy: ctx.user.name });
  await audit(ctx, "create", "stock_count", r.id, { number: r.number, location: location.name, lines: r.lines });
  revalidate();
  return redirectWith(`/counts/${r.id}`, `Инвентаризация ${r.number} е започната: ${r.lines} реда за броене.`);
});

/** Сканиране / въвеждане на код от скенер. */
export const scanCount = act(async (countId: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const mode = oneOf(fd, "mode", ["add", "set"] as const, "add");
  const { item, line } = await recordCount(ctx.db, countId, str(fd, "code"), parseQuantity(str(fd, "quantity"), MAX_DECIMALS, "Количество", 1), mode);
  revalidate(countId);
  const name = item.variantLabel ? `${item.name} · ${item.variantLabel}` : item.name;
  return `${name}${line.lotNumber ? ` (${line.lotNumber})` : ""}: преброени ${line.counted} ${item.unit}`;
});

/** Таблицата с количества: поле counted_<id>, празно = неброено. */
export const saveCounts = act(async (countId: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const values = new Map<number, number | null>();
  for (const [key, raw] of fd.entries()) {
    const m = key.match(/^counted_(\d+)$/);
    if (!m || typeof raw !== "string") continue;
    const v = raw.trim();
    values.set(Number(m[1]), v === "" ? null : Number(v.replace(",", ".")));
  }
  const changed = await saveCountedValues(ctx.db, countId, values);
  if (changed) await audit(ctx, "update", "stock_count", countId, { counted: changed });
  revalidate(countId);
  return changed ? `Запазени са ${changed} количества.` : "Няма промени.";
});

export const addCountLot = act(async (countId: number, fd: FormData) => {
  const ctx = await requireContext("write");
  const itemId = int(fd, "itemId", 0);
  const lotNumber = str(fd, "lotNumber");
  await addLotLine(ctx.db, countId, itemId, lotNumber, parseQuantity(str(fd, "quantity"), MAX_DECIMALS, "Количество", 1));
  await audit(ctx, "update", "stock_count", countId, { itemId, lotNumber: lotNumber.trim() });
  revalidate(countId);
  return "Партидата е добавена към броенето.";
});

/** Прилагане на разликите — мениджър или по-висока роля. */
export const applyCount = act(async (countId: number, fd: FormData) => {
  const ctx = await requireContext("delete");
  const r = await applyStockCount(ctx.db, countId, ctx.user, { uncountedAsZero: bool(fd, "uncountedAsZero") });
  await audit(ctx, "status", "stock_count", countId, { number: r.number, status: "applied", adjusted: r.adjusted, valueDelta: r.valueDelta });
  revalidate(countId);
  revalidatePath("/items");
  revalidatePath("/");
  return `${r.number} е приложена: ${r.adjusted} корекции, разлика в стойността ${formatMoney(r.valueDelta, ctx.org.currency)}.`;
});

export const cancelCount = act(async (countId: number) => {
  const ctx = await requireContext("write");
  await cancelStockCount(ctx.db, countId);
  await audit(ctx, "status", "stock_count", countId, { status: "cancelled" });
  revalidate(countId);
  return "Инвентаризацията е отказана. Наличността не е променена.";
});
