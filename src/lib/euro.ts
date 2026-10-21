import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { controlDb } from "@/db/control";
import { organizations, type Organization } from "@/db/control-schema";
import { getTenantDb, type TenantDb } from "@/db/tenant";
import { auditLog, costLayers, items, orderLines, orders, settings, shipmentLines, stockMovements } from "@/db/tenant-schema";
import { bgnToEur, BGN_PER_EUR } from "./currency";

/** Маркер в settings: превалутирането е направено (и кога). Ключът е първичен — второ изпълнение се отказва. */
export const EURO_MARKER = "currency.euroConvertedAt";

type Actor = { id: number | null; name: string };
export type EuroResult = { status: "converted" | "already" | "not-bgn"; items: number; orderLines: number; orders: number };

/**
 * Превалутира организация от лева в евро по фиксирания курс 1.95583:
 *  - продажните цени на артикулите и цените по клиентски поръчки → до стотинка (както изисква законът за цените);
 *  - доставните цени и цените по поръчки за доставка → до 4 знака (себестойността не губи точност);
 *  - поръчките пазят оригиналната валута и цена на всеки ред (originalCurrency, originalUnitPrice);
 *  - себестойността на движенията, FIFO слоевете и доставните цени по пратки — също в евро.
 * Цялата клиентска база се променя в една транзакция; маркерът в settings прави повторното изпълнение
 * безопасно. Валутата в контролната база се сменя след това (при прекъсване повторното извикване я довършва).
 */
export async function convertTenantToEuro(org: Organization, actor: Actor, o: { dryRun?: boolean } = {}): Promise<EuroResult> {
  if (org.currency !== "BGN") return { status: "not-bgn", items: 0, orderLines: 0, orders: 0 };
  const db = getTenantDb(org);
  const result: EuroResult = { status: "converted", items: 0, orderLines: 0, orders: 0 };

  const [done] = await db.select().from(settings).where(eq(settings.key, EURO_MARKER));
  if (done) {
    result.status = "already";
  } else if (o.dryRun) {
    result.items = (await db.select({ id: items.id }).from(items)).length;
    result.orderLines = (await db.select({ id: orderLines.id }).from(orderLines)).length;
    result.orders = (await db.select({ id: orders.id }).from(orders).where(isNull(orders.originalCurrency))).length;
    return result;
  } else {
    try {
      await convertAmounts(db, org, actor, result);
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      result.status = "already"; // друго изпълнение току-що го направи
    }
  }

  await controlDb.update(organizations).set({ currency: "EUR" }).where(and(eq(organizations.id, org.id), eq(organizations.currency, "BGN")));
  return result;
}

async function convertAmounts(db: TenantDb, org: Organization, actor: Actor, result: EuroResult) {
  await db.transaction(async (tx) => {
    // първо маркерът: паралелно второ изпълнение се спъва в първичния ключ и транзакцията му се отменя
    await tx.insert(settings).values({ key: EURO_MARKER, value: new Date().toISOString() });

    for (const it of await tx.select({ id: items.id, unitCost: items.unitCost, unitPrice: items.unitPrice }).from(items)) {
      await tx.update(items).set({ unitCost: bgnToEur(it.unitCost, 4), unitPrice: bgnToEur(it.unitPrice, 2) }).where(eq(items.id, it.id));
      result.items++;
    }

    const lines = await tx
      .select({ id: orderLines.id, unitPrice: orderLines.unitPrice, type: orders.type })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(isNull(orders.originalCurrency));
    for (const l of lines) {
      await tx.update(orderLines).set({ originalUnitPrice: l.unitPrice, unitPrice: bgnToEur(l.unitPrice, l.type === "sales" ? 2 : 4) }).where(eq(orderLines.id, l.id));
      result.orderLines++;
    }
    const [res] = await tx.update(orders).set({ originalCurrency: "BGN" }).where(isNull(orders.originalCurrency));
    result.orders = res.affectedRows;

    // складовата история и FIFO слоевете (може да са много редове — направо в SQL; ROUND върху DECIMAL е половинката далеч от нулата)
    await tx.update(stockMovements).set({ unitCost: sql`round(${stockMovements.unitCost} / ${BGN_PER_EUR}, 4)`, value: sql`round(${stockMovements.value} / ${BGN_PER_EUR}, 2)` });
    await tx.update(costLayers).set({ unitCost: sql`round(${costLayers.unitCost} / ${BGN_PER_EUR}, 4)` });
    await tx.update(shipmentLines).set({ unitCost: sql`round(${shipmentLines.unitCost} / ${BGN_PER_EUR}, 4)` }).where(isNotNull(shipmentLines.unitCost));

    await tx.insert(auditLog).values({
      userId: actor.id,
      userName: actor.name,
      action: "currency",
      entity: "organization",
      entityId: org.id,
      details: { from: "BGN", to: "EUR", rate: BGN_PER_EUR, items: result.items, orderLines: result.orderLines, orders: result.orders },
    });
  });
}

function isDuplicateKey(e: unknown): boolean {
  for (let c: unknown = e; c && typeof c === "object"; c = (c as { cause?: unknown }).cause) {
    if ((c as { code?: string }).code === "ER_DUP_ENTRY") return true;
  }
  return false;
}
