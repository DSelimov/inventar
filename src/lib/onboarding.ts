import "server-only";
import { addDays, format } from "date-fns";
import { and, count, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import { controlDb } from "@/db/control";
import { memberships } from "@/db/control-schema";
import type { TenantDb } from "@/db/tenant";
import { categories, items, orderLines, orders, partners, settings, shipmentLines, shipments, stockCountLines, stockMovements } from "@/db/tenant-schema";
import { UserError } from "./errors";
import { getDefaultLocation } from "./queries";
import { getCompanyDetails, setSetting } from "./settings";
import { applyMovement, type Actor } from "./stock";
import { assignVat } from "./vat-rates";

/** Стъпки за нова организация: показват се на таблото, докато не са изпълнени или скрити. */
export async function onboardingState(db: TenantDb, organizationId: number) {
  const [company, [cats], [itemCount], [members], rows] = await Promise.all([
    getCompanyDetails(db),
    db.select({ n: count() }).from(categories),
    db.select({ n: count() }).from(items),
    controlDb.select({ n: count() }).from(memberships).where(eq(memberships.organizationId, organizationId)),
    db.select().from(settings).where(inArray(settings.key, ["onboarding.dismissed", "demo.ids"])),
  ]);
  const flag = (k: string) => rows.find((r) => r.key === k)?.value;
  const steps = [
    { key: "company", label: "Данни за фирмата за документите", href: "/settings", done: Boolean(company.legalName || company.eik) },
    { key: "category", label: "Първа категория", href: "/categories", done: cats.n > 0 },
    { key: "items", label: "Артикули — ръчно или от CSV", href: "/onboarding", done: itemCount.n > 0 },
    { key: "team", label: "Покани колега", href: "/settings/users", done: members.n > 1 },
  ];
  return { steps, done: steps.filter((s) => s.done).length, dismissed: flag("onboarding.dismissed") === "true", hasDemo: Boolean(flag("demo.ids")), empty: itemCount.n === 0 };
}

export async function dismissOnboarding(db: TenantDb) {
  await setSetting(db, "onboarding.dismissed", "true");
}

// ----------------------------------------------------------- бърз старт
export type QuickItem = { name: string; quantity: number; unit: string; unitPrice: number };

/** Категория (по избор) и няколко артикула с начална наличност в основната локация. */
export async function quickStart(db: TenantDb, actor: Actor & object, o: { category: string | null; items: QuickItem[] }, slug: (name: string) => string) {
  if (!o.items.length) throw new UserError("Добавете поне един артикул.");
  const location = await getDefaultLocation(db);
  if (!location) throw new UserError("Създайте първо локация (Настройки › Локации).");
  return db.transaction(async (tx) => {
    let categoryId: number | null = null;
    if (o.category) [{ id: categoryId }] = await tx.insert(categories).values({ name: o.category }).$returningId();
    const used = new Set((await tx.select({ sku: items.sku }).from(items)).map((r) => r.sku));
    const ids: number[] = [];
    for (const it of o.items) {
      let sku = slug(it.name) || "ART";
      for (let i = 2; used.has(sku); i++) sku = `${slug(it.name)}-${i}`;
      used.add(sku);
      const [{ id }] = await tx.insert(items).values({ sku, name: it.name, unit: it.unit || "бр.", unitPrice: it.unitPrice, categoryId }).$returningId();
      if (it.quantity > 0) await applyMovement(tx, { actor, itemId: id, locationId: location.id, type: "in", quantity: it.quantity, reason: "Начална наличност" });
      ids.push(id);
    }
    return { categoryId, ids };
  });
}

// ----------------------------------------------------------- демо данни
const DEMO = {
  categories: [
    { name: "Демо: Електроника", color: "#4f46e5" },
    { name: "Демо: Офис консумативи", color: "#f59e0b" },
  ],
  items: [
    { sku: "DEMO-MISHKA", barcode: "2000000000017", name: "Безжична мишка (демо)", cat: 0, minQuantity: 10, unitCost: 12.5, unitPrice: 24.9, qty: 35 },
    { sku: "DEMO-KABEL", barcode: "2000000000024", name: "USB-C кабел 2 м (демо)", cat: 0, minQuantity: 40, unitCost: 2.1, unitPrice: 7.9, qty: 120 },
    { sku: "DEMO-HUB", barcode: "2000000000031", name: "USB хъб 7 порта (демо)", cat: 0, minQuantity: 5, unitCost: 19, unitPrice: 39, qty: 3 },
    { sku: "DEMO-HARTIA", barcode: "2000000000048", name: "Копирна хартия А4 (демо)", cat: 1, minQuantity: 12, unitCost: 3.6, unitPrice: 6.5, qty: 40, unit: "пакет" },
    { sku: "DEMO-HIMIKALKA", barcode: "2000000000055", name: "Химикалка синя (демо)", cat: 1, minQuantity: 50, unitCost: 0.18, unitPrice: 0.6, qty: 300 },
    { sku: "DEMO-TONER", barcode: "2000000000062", name: "Тонер касета (демо)", cat: 1, minQuantity: 4, unitCost: 41, unitPrice: 69, qty: 2 },
  ],
  partners: [
    { type: "supplier" as const, name: "Демо Доставчик ООД", email: "orders@demo-dostavchik.bg", leadTimeDays: 5 },
    { type: "customer" as const, name: "Демо Клиент ЕООД", email: "office@demo-klient.bg" },
  ],
};
type DemoIds = { categories: number[]; items: number[]; partners: number[]; orders: number[] };

/** Примерни данни в празна организация. Записва създадените записи, за да може да се изтрият точно те. */
export async function loadDemoData(db: TenantDb, actor: Actor & object) {
  const [[{ n }], location] = await Promise.all([db.select({ n: count() }).from(items), getDefaultLocation(db)]);
  if (n > 0) throw new UserError("Демо данни се зареждат само в организация без артикули.");
  if (!location) throw new UserError("Създайте първо локация.");
  const ids: DemoIds = { categories: [], items: [], partners: [], orders: [] };
  await db.transaction(async (tx) => {
    for (const c of DEMO.categories) ids.categories.push((await tx.insert(categories).values({ ...c, description: "Примерни данни — изтриват се от Първи стъпки." }).$returningId())[0].id);
    for (const it of DEMO.items) {
      const [{ id }] = await tx
        .insert(items)
        .values({ sku: it.sku, barcode: it.barcode, name: it.name, categoryId: ids.categories[it.cat], minQuantity: it.minQuantity, unitCost: it.unitCost, unitPrice: it.unitPrice, unit: it.unit ?? "бр." })
        .$returningId();
      ids.items.push(id);
      await applyMovement(tx, { actor, itemId: id, locationId: location.id, type: "in", quantity: it.qty, reason: DEMO_STOCK_REASON });
    }
    for (const p of DEMO.partners) ids.partners.push((await tx.insert(partners).values(p).$returningId())[0].id);
    const [{ id: po }] = await tx
      .insert(orders)
      .values({ type: "purchase", number: "ДЕМО-ПЗ-001", partnerId: ids.partners[0], locationId: location.id, status: "confirmed", expectedDate: format(addDays(new Date(), 5), "yyyy-MM-dd"), notes: "Примерна поръчка за доставка.", createdBy: actor.id })
      .$returningId();
    ids.orders.push(po);
    await tx.insert(orderLines).values(
      await assignVat(tx, [
        { orderId: po, itemId: ids.items[2], quantity: 20, unitPrice: 19 },
        { orderId: po, itemId: ids.items[5], quantity: 6, unitPrice: 41 },
      ]),
    );
    await tx.insert(settings).values({ key: "demo.ids", value: JSON.stringify(ids) }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(ids) } });
  });
  return { items: ids.items.length };
}

const DEMO_STOCK_REASON = "Демо: начална наличност";

/** Изтрива само записите, създадени от loadDemoData (и всичко, свързано с тях каскадно). */
export async function removeDemoData(db: TenantDb) {
  const [row] = await db.select().from(settings).where(eq(settings.key, "demo.ids"));
  if (!row) throw new UserError("Няма заредени демо данни.");
  const ids = JSON.parse(row.value) as DemoIds;
  await assertDemoUnused(db, ids);
  await db.transaction(async (tx) => {
    if (ids.orders.length) await tx.delete(orders).where(inArray(orders.id, ids.orders));
    if (ids.items.length) await tx.delete(items).where(inArray(items.id, ids.items));
    if (ids.partners.length) await tx.delete(partners).where(inArray(partners.id, ids.partners));
    if (ids.categories.length) await tx.delete(categories).where(inArray(categories.id, ids.categories));
    await tx.delete(settings).where(eq(settings.key, "demo.ids"));
  });
  return ids;
}

/**
 * Каскадното изтриване на демо артикулите би изтрило и редове от истински поръчки, пратки, броения и
 * движения — затова при такава употреба отказваме вместо да трием тихо.
 */
async function assertDemoUnused(db: TenantDb, ids: DemoIds) {
  if (!ids.items.length && !ids.partners.length) return;
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const itemIds = ids.items.length ? ids.items : [0];
  const partnerIds = ids.partners.length ? ids.partners : [0];
  const orderIds = ids.orders.length ? ids.orders : [0];
  const used =
    (await n(db.select({ n: count() }).from(orderLines).where(and(inArray(orderLines.itemId, itemIds), notInArray(orderLines.orderId, orderIds))))) +
    (await n(db.select({ n: count() }).from(shipmentLines).where(inArray(shipmentLines.itemId, itemIds)))) +
    (await n(db.select({ n: count() }).from(stockCountLines).where(inArray(stockCountLines.itemId, itemIds)))) +
    (await n(db.select({ n: count() }).from(stockMovements).where(and(inArray(stockMovements.itemId, itemIds), or(isNull(stockMovements.reason), ne(stockMovements.reason, DEMO_STOCK_REASON)))))) +
    (await n(db.select({ n: count() }).from(orders).where(and(inArray(orders.partnerId, partnerIds), notInArray(orders.id, orderIds))))) +
    (await n(db.select({ n: count() }).from(shipments).where(inArray(shipments.partnerId, partnerIds))));
  if (used) throw new UserError("Демо артикулите или партньорите вече се използват в поръчки, пратки, движения или инвентаризации. Изтрийте ги поотделно, за да не загубите истински данни.");
}
