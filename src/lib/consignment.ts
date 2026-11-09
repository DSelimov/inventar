import "server-only";
/**
 * Консигнация (стока на отговорно пазене при клиент): всеки партньор има своя консигнационна локация.
 *  - give: трансфер склад → партньор (стоката остава наша и със същата себестойност);
 *  - report: отчет за продаденото — изпълнена продажба от консигнационната локация (вземане, фактура);
 *  - return: трансфер обратно в склада.
 * Всичко е в една транзакция през applyMovement; документът е КСГ-ГГГГ-NNN.
 * Артикули с партиди/серийни номера не се дават на консигнация (нужен е избор на партида при всяко движение).
 */
import { and, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import type { Db, TenantDb } from "@/db/tenant";
import { consignmentLines, consignments, itemPrices, items, locations, orderLines, orders, partners, stockLevels, type ConsignmentKind } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";
import { salesPrice } from "./pricing";
import { getSettings } from "./settings";
import { applyMovement, type Actor } from "./stock";
import { assignVat } from "./vat-rates";
import { emit } from "./webhooks";

export const CONSIGNMENT_LABELS: Record<ConsignmentKind, string> = { give: "Даване на консигнация", report: "Отчет за продадено", return: "Връщане от консигнация" };

/** Консигнационната локация на партньора (създава се при първото даване). */
export async function consignmentLocation(tx: Db, partnerId: number, create: boolean) {
  const [existing] = await tx.select().from(locations).where(eq(locations.partnerId, partnerId));
  if (existing) return existing;
  if (!create) throw new UserError("Партньорът няма стока на консигнация.");
  const [partner] = await tx.select().from(partners).where(eq(partners.id, partnerId));
  if (!partner) throw new UserError("Партньорът не е намерен.");
  const [{ id }] = await tx.insert(locations).values({ name: `Консигнация: ${partner.name}`.slice(0, 200), partnerId, code: `KSG-${partnerId}` }).$returningId();
  const [row] = await tx.select().from(locations).where(eq(locations.id, id));
  return row;
}

export type ConsignmentInput = {
  kind: ConsignmentKind;
  partnerId: number;
  /** Складът — откъдето се дава / където се връща (за give и return). */
  warehouseId?: number | null;
  lines: Array<{ itemId: number; quantity: number; unitPrice?: number | null }>;
  notes?: string | null;
};

export async function runConsignment(db: TenantDb, actor: Actor, input: ConsignmentInput) {
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) throw new UserError("Добавете поне един артикул.");
  if (input.kind !== "report" && !input.warehouseId) throw new UserError("Изберете склад.");
  const found = await db.select().from(items).where(inArray(items.id, [...new Set(lines.map((l) => l.itemId))]));
  for (const it of found) if (it.tracking !== "none") throw new UserError(`„${it.name}“ е с партиди/серийни номера — не се дава на консигнация.`);
  if (found.length !== new Set(lines.map((l) => l.itemId)).size) throw new UserError("Артикулът не е намерен.");

  const result = await db.transaction(async (tx) => {
    const loc = await consignmentLocation(tx, input.partnerId, input.kind === "give");
    if (input.warehouseId === loc.id) throw new UserError("Изберете склад, различен от консигнационната локация.");
    const number = await nextNumber(tx, "consignment");
    const reason = `${CONSIGNMENT_LABELS[input.kind]} ${number}`;
    let orderId: number | null = null;
    const priced: Array<{ itemId: number; quantity: number; unitPrice: number | null }> = [];

    if (input.kind === "give" || input.kind === "return") {
      const [from, to] = input.kind === "give" ? [input.warehouseId!, loc.id] : [loc.id, input.warehouseId!];
      for (const l of lines) {
        await applyMovement(tx, { actor, itemId: l.itemId, locationId: from, type: "transfer_out", quantity: l.quantity, reason });
        await applyMovement(tx, { actor, itemId: l.itemId, locationId: to, type: "transfer_in", quantity: l.quantity, reason });
        priced.push({ itemId: l.itemId, quantity: l.quantity, unitPrice: null });
      }
    } else {
      // цена: подадената, иначе по ценовата група и отстъпката на партньора
      const [partner] = await tx.select().from(partners).where(eq(partners.id, input.partnerId));
      const groupId = partner?.priceGroupId ?? loc.priceGroupId ?? null;
      const groupPrices = groupId ? await tx.select().from(itemPrices).where(and(eq(itemPrices.priceGroupId, groupId), inArray(itemPrices.itemId, lines.map((l) => l.itemId)))) : [];
      for (const l of lines) {
        const it = found.find((x) => x.id === l.itemId)!;
        const unitPrice = l.unitPrice ?? salesPrice({ retail: it.unitPrice, groupPrice: groupPrices.find((g) => g.itemId === l.itemId)?.price ?? null, discountPercent: partner?.discountPercent });
        priced.push({ itemId: l.itemId, quantity: l.quantity, unitPrice });
      }
      const withVat = await assignVat(tx, priced.map((p) => ({ itemId: p.itemId, quantity: p.quantity, unitPrice: p.unitPrice ?? 0 })));
      const orderNumber = await nextNumber(tx, "sales");
      const [o] = await tx
        .insert(orders)
        .values({
          type: "sales",
          number: orderNumber,
          partnerId: input.partnerId,
          locationId: loc.id,
          status: "completed",
          orderDate: new Date().toISOString().slice(0, 10),
          notes: `Отчет за консигнация ${number}`,
          pricesIncludeVat: (await getSettings(tx)).pricesIncludeVat,
          createdBy: actor?.id ?? null,
        })
        .$returningId();
      orderId = o.id;
      await tx.insert(orderLines).values(withVat.map((l) => ({ ...l, orderId: o.id, fulfilledQuantity: l.quantity })));
      for (const l of lines) await applyMovement(tx, { actor, itemId: l.itemId, locationId: loc.id, type: "out", quantity: l.quantity, reason, orderId: o.id });
      emit(tx, "order.created", { id: o.id, number: orderNumber, type: "sales", source: "consignment" });
    }

    const [row] = await tx
      .insert(consignments)
      .values({ number, kind: input.kind, partnerId: input.partnerId, locationId: loc.id, warehouseId: input.warehouseId ?? null, orderId, notes: input.notes ?? null, createdBy: actor?.id ?? null, createdByName: actor?.name ?? null })
      .$returningId();
    await tx.insert(consignmentLines).values(priced.map((p) => ({ ...p, consignmentId: row.id })));
    return { id: row.id, number, orderId };
  });
  return result;
}

/** Наличност на консигнация: по партньор и артикул. */
export async function consignmentStock(db: Db, partnerId?: number) {
  return db
    .select({ partnerId: locations.partnerId, locationId: locations.id, itemId: items.id, name: items.name, sku: items.sku, unit: items.unit, quantity: stockLevels.quantity, unitCost: items.unitCost, unitPrice: items.unitPrice })
    .from(stockLevels)
    .innerJoin(locations, eq(locations.id, stockLevels.locationId))
    .innerJoin(items, eq(items.id, stockLevels.itemId))
    .where(and(isNotNull(locations.partnerId), gt(stockLevels.quantity, 0), partnerId ? eq(locations.partnerId, partnerId) : undefined))
    .orderBy(items.name);
}

export async function listConsignments(db: Db, partnerId?: number, limit = 100) {
  return db.query.consignments.findMany({
    where: partnerId ? eq(consignments.partnerId, partnerId) : undefined,
    with: { partner: true, warehouse: true, order: true, lines: { with: { item: true } } },
    orderBy: [desc(consignments.createdAt), desc(consignments.id)],
    limit,
  });
}

export async function getConsignment(db: Db, id: number) {
  return db.query.consignments.findFirst({ where: eq(consignments.id, id), with: { partner: true, warehouse: true, location: true, order: true, lines: { with: { item: true } } } });
}
