/* Демонстрационни данни.  pnpm db:seed
   Вход: admin@demo.bg / demo1234 (собственик), sklad@demo.bg / demo1234 (служител) */
import { addDays, format, subDays } from "date-fns";
import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  calendarEvents,
  categories,
  collectionItems,
  collections,
  fieldDefinitions,
  itemFieldValues,
  items,
  locations,
  lots,
  memberships,
  orderLines,
  orders,
  organizations,
  partners,
  settings,
  shipmentLines,
  shipments,
  stockLevels,
  stockMovements,
  users,
} from "./schema";
import { hashPassword } from "../lib/auth-crypto";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const today = new Date();

async function main() {
  await db.execute(sql`truncate table
    audit_log, webhook_deliveries, webhooks, api_keys, settings, calendar_events, collection_items, collections,
    shipment_lines, shipments, order_lines, orders, partners, stock_movements, lots, stock_levels, item_field_values,
    items, field_definitions, categories, locations, sessions, memberships, users, organizations
    restart identity cascade`);

  const [org] = await db.insert(organizations).values({ name: "Демо Трейдинг ЕООД", slug: "demo-trading", currency: "EUR" }).returning();
  const [org2] = await db.insert(organizations).values({ name: "Втора фирма ООД", slug: "vtora-firma", currency: "EUR" }).returning();
  const [admin, worker] = await db
    .insert(users)
    .values([
      { email: "admin@demo.bg", name: "Админ Демо", passwordHash: hashPassword("demo1234") },
      { email: "sklad@demo.bg", name: "Иван Складов", passwordHash: hashPassword("demo1234") },
    ])
    .returning();
  await db.insert(memberships).values([
    { userId: admin.id, organizationId: org.id, role: "owner" },
    { userId: admin.id, organizationId: org2.id, role: "owner" },
    { userId: worker.id, organizationId: org.id, role: "staff" },
  ]);
  const O = org.id;

  await db.insert(settings).values([
    { organizationId: O, key: "lowStockAlerts", value: "true" },
    { organizationId: O, key: "windowDays", value: "30" },
    { organizationId: O, key: "deadStockDays", value: "90" },
  ]);

  const [main, shop] = await db
    .insert(locations)
    .values([
      { organizationId: O, name: "Основен склад", code: "MAIN", address: "София, бул. Европа 10", isDefault: true },
      { organizationId: O, name: "Магазин Център", code: "SHOP1", address: "София, ул. Витоша 25" },
    ])
    .returning();
  await db.insert(locations).values({ organizationId: org2.id, name: "Основен склад", code: "MAIN", isDefault: true });

  const [electronics, apparel, food, office] = await db
    .insert(categories)
    .values([
      { organizationId: O, name: "Електроника", color: "#4f46e5", description: "Устройства, аксесоари и кабели." },
      { organizationId: O, name: "Облекло", color: "#db2777", description: "Дрехи с размери и цветове." },
      { organizationId: O, name: "Храни и напитки", color: "#16a34a", description: "Бързооборотни стоки със срок на годност." },
      { organizationId: O, name: "Офис консумативи", color: "#f59e0b", description: "Хартия, пишещи средства и консумативи." },
    ])
    .returning();

  const fields = await db
    .insert(fieldDefinitions)
    .values([
      { categoryId: electronics.id, name: "Марка", type: "text", sortOrder: 0 },
      { categoryId: electronics.id, name: "Гаранция (месеци)", type: "number", sortOrder: 1 },
      { categoryId: apparel.id, name: "Материя", type: "text", sortOrder: 0 },
      { categoryId: food.id, name: "Съхранение", type: "select", options: JSON.stringify(["Стайна температура", "Хладилно", "Замразено"]), sortOrder: 0 },
    ])
    .returning();
  const f = (name: string) => fields.find((x) => x.name === name)!.id;

  const rows = await db
    .insert(items)
    .values([
      { organizationId: O, sku: "EL-MISHKA-01", barcode: "3800100000011", name: "Безжична мишка", categoryId: electronics.id, minQuantity: 10, unitCost: 12.5, unitPrice: 24.9 },
      { organizationId: O, sku: "EL-KLAV-01", barcode: "3800100000028", name: "Механична клавиатура", categoryId: electronics.id, minQuantity: 10, unitCost: 48, unitPrice: 89, tracking: "serial" },
      { organizationId: O, sku: "EL-USBC-2M", barcode: "3800100000035", name: "USB-C кабел 2 м", categoryId: electronics.id, minQuantity: 40, unitCost: 2.1, unitPrice: 7.9 },
      { organizationId: O, sku: "EL-HUB-7", barcode: "3800100000042", name: "USB хъб 7 порта", categoryId: electronics.id, minQuantity: 5, unitCost: 19, unitPrice: 39 },
      { organizationId: O, sku: "OB-TEE-CHER", name: "Тениска черна", categoryId: apparel.id, minQuantity: 0, unitCost: 4.2, unitPrice: 14.9 },
      { organizationId: O, sku: "OB-SUIT-SIV-L", barcode: "3800100000066", name: "Суитшърт сив", categoryId: apparel.id, minQuantity: 15, unitCost: 15.8, unitPrice: 44.9 },
      { organizationId: O, sku: "HR-KAFE-1K", barcode: "3800100000073", name: "Кафе на зърна 1 кг", categoryId: food.id, minQuantity: 10, unit: "пакет", unitCost: 9.4, unitPrice: 17.9, tracking: "lot" },
      { organizationId: O, sku: "HR-VODA-05", barcode: "3800100000080", name: "Минерална вода 0,5 л", categoryId: food.id, minQuantity: 120, unit: "бут.", unitCost: 0.22, unitPrice: 0.9, tracking: "lot" },
      { organizationId: O, sku: "OF-A4-500", barcode: "3800100000097", name: "Копирна хартия А4, 500 л.", categoryId: office.id, minQuantity: 12, unit: "пакет", unitCost: 3.6, unitPrice: 6.5 },
      { organizationId: O, sku: "OF-HIM-SIN", barcode: "3800100000103", name: "Химикалка синя", categoryId: office.id, minQuantity: 50, unitCost: 0.18, unitPrice: 0.6 },
      { organizationId: O, sku: "OF-TONER-85A", barcode: "3800100000110", name: "Тонер касета 85A", categoryId: office.id, minQuantity: 4, unitCost: 41, unitPrice: 69 },
    ])
    .returning();
  const item = (sku: string) => rows.find((r) => r.sku === sku)!;

  // variants of the T-shirt
  const tee = item("OB-TEE-CHER");
  const variants = await db
    .insert(items)
    .values(["S", "M", "L", "XL"].map((size, i) => ({
      organizationId: O,
      parentId: tee.id,
      variantLabel: size,
      sku: `${tee.sku}-${size}`,
      barcode: `38001000002${i}0`,
      name: tee.name,
      categoryId: apparel.id,
      minQuantity: 5,
      unitCost: 4.2,
      unitPrice: 14.9,
    })))
    .returning();

  await db.insert(itemFieldValues).values([
    { itemId: item("EL-MISHKA-01").id, fieldId: f("Марка"), value: "Logi" },
    { itemId: item("EL-MISHKA-01").id, fieldId: f("Гаранция (месеци)"), value: "24" },
    { itemId: item("EL-KLAV-01").id, fieldId: f("Марка"), value: "Keychron" },
    { itemId: tee.id, fieldId: f("Материя"), value: "100% памук" },
    { itemId: item("HR-KAFE-1K").id, fieldId: f("Съхранение"), value: "Стайна температура" },
  ]);

  // ---- opening stock helper (writes level + lot + movement + cached total)
  const totals = new Map<number, number>();
  async function stockIn(itemId: number, locationId: number, qty: number, daysAgo: number, reason: string, lot?: { lotNumber: string; expiryDate?: string; serial?: boolean }, userId = admin.id) {
    const before = totals.get(itemId) ?? 0;
    const after = before + qty;
    totals.set(itemId, after);
    await db
      .insert(stockLevels)
      .values({ itemId, locationId, quantity: qty })
      .onConflictDoUpdate({ target: [stockLevels.itemId, stockLevels.locationId], set: { quantity: sql`${stockLevels.quantity} + ${qty}` } });
    let lotId: number | null = null;
    if (lot) {
      if (lot.serial) {
        for (let i = 0; i < qty; i++) {
          const serial = `${lot.lotNumber}${String(i + 1).padStart(3, "0")}`;
          await db.insert(lots).values({ organizationId: O, itemId, locationId, lotNumber: serial, serialNumber: serial, quantity: 1 });
        }
      } else {
        const [l] = await db.insert(lots).values({ organizationId: O, itemId, locationId, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate ?? null, quantity: qty }).returning();
        lotId = l.id;
      }
    }
    await db.update(items).set({ quantity: after }).where(sql`${items.id} = ${itemId}`);
    await db.insert(stockMovements).values({ organizationId: O, itemId, locationId, lotId, userId, type: "in", delta: qty, quantityAfter: after, reason, createdAt: subDays(today, daysAgo) });
  }
  async function stockOut(itemId: number, locationId: number, qty: number, daysAgo: number, reason: string, shipmentId: number | null = null) {
    const before = totals.get(itemId) ?? 0;
    const after = before - qty;
    totals.set(itemId, after);
    await db.update(stockLevels).set({ quantity: sql`${stockLevels.quantity} - ${qty}` }).where(sql`${stockLevels.itemId} = ${itemId} and ${stockLevels.locationId} = ${locationId}`);
    await db.update(items).set({ quantity: after }).where(sql`${items.id} = ${itemId}`);
    await db.insert(stockMovements).values({ organizationId: O, itemId, locationId, userId: worker.id, type: "out", delta: -qty, quantityAfter: after, reason, shipmentId, createdAt: subDays(today, daysAgo) });
  }

  await stockIn(item("EL-MISHKA-01").id, main.id, 40, 60, "Начална наличност");
  await stockIn(item("EL-MISHKA-01").id, shop.id, 20, 60, "Начална наличност");
  await stockIn(item("EL-KLAV-01").id, main.id, 8, 45, "Начална наличност", { lotNumber: "KB-2026-", serial: true });
  await stockIn(item("EL-USBC-2M").id, main.id, 150, 60, "Начална наличност");
  await stockIn(item("EL-HUB-7").id, main.id, 5, 60, "Начална наличност");
  for (const v of variants) await stockIn(v.id, main.id, v.variantLabel === "M" ? 30 : 12, 50, "Начална наличност");
  await stockIn(variants[1].id, shop.id, 16, 50, "Начална наличност");
  await stockIn(item("OB-SUIT-SIV-L").id, main.id, 17, 50, "Начална наличност");
  await stockIn(item("HR-KAFE-1K").id, main.id, 25, 40, "Начална наличност", { lotNumber: "KF-2605", expiryDate: iso(addDays(today, 120)) });
  await stockIn(item("HR-KAFE-1K").id, main.id, 10, 10, "Доставка", { lotNumber: "KF-2609", expiryDate: iso(addDays(today, 20)) });
  await stockIn(item("HR-VODA-05").id, main.id, 480, 30, "Начална наличност", { lotNumber: "VD-0426", expiryDate: iso(addDays(today, 365)) });
  await stockIn(item("OF-A4-500").id, main.id, 36, 60, "Начална наличност");
  await stockIn(item("OF-HIM-SIN").id, main.id, 210, 60, "Начална наличност");
  await stockIn(item("OF-HIM-SIN").id, shop.id, 90, 60, "Начална наличност");
  await stockIn(item("OF-TONER-85A").id, main.id, 4, 60, "Начална наличност");

  // sales history for reports
  for (let d = 28; d >= 1; d -= 3) {
    await stockOut(item("EL-MISHKA-01").id, shop.id, 1, d, `Продажба №${1000 + d}`);
    await stockOut(item("EL-USBC-2M").id, main.id, 4, d, `Продажба №${1100 + d}`);
    await stockOut(variants[1].id, shop.id, 1, d, `Продажба №${1200 + d}`);
    await stockOut(item("OF-HIM-SIN").id, shop.id, 5, d, `Продажба №${1300 + d}`);
  }
  await stockOut(item("EL-HUB-7").id, main.id, 5, 2, "Продажба №1051");
  await stockOut(item("OF-TONER-85A").id, main.id, 1, 3, "Инвентаризация: една повредена");

  // ---- partners, orders, shipments
  const [techSupply, beans, officePoint, studio] = await db
    .insert(partners)
    .values([
      { organizationId: O, type: "supplier", name: "ТехСъплай ООД", email: "orders@techsupply.bg", phone: "+359 2 123 4567", leadTimeDays: 5, vatNumber: "BG123456789" },
      { organizationId: O, type: "supplier", name: "Кафе Братя ЕООД", email: "sales@kafebratya.bg", leadTimeDays: 3 },
      { organizationId: O, type: "customer", name: "Офис Пойнт ООД", email: "office@officepoint.bg", phone: "+359 88 765 4321" },
      { organizationId: O, type: "both", name: "Студио Норд", email: "hello@studionord.bg" },
    ])
    .returning();

  const [po1, po2, so1] = await db
    .insert(orders)
    .values([
      { organizationId: O, type: "purchase", number: "ПЗ-2026-001", partnerId: techSupply.id, locationId: main.id, status: "partial", orderDate: iso(subDays(today, 6)), expectedDate: iso(addDays(today, 3)), createdBy: admin.id },
      { organizationId: O, type: "purchase", number: "ПЗ-2026-002", partnerId: beans.id, locationId: main.id, status: "confirmed", orderDate: iso(subDays(today, 1)), expectedDate: iso(addDays(today, 2)), createdBy: admin.id },
      { organizationId: O, type: "sales", number: "ПР-2026-001", partnerId: officePoint.id, locationId: main.id, status: "confirmed", orderDate: iso(subDays(today, 2)), expectedDate: iso(subDays(today, 1)), notes: "Клиентът помоли за доставка преди обяд.", createdBy: worker.id },
    ])
    .returning();
  await db.insert(orderLines).values([
    { orderId: po1.id, itemId: item("EL-HUB-7").id, quantity: 30, fulfilledQuantity: 10, unitPrice: 19 },
    { orderId: po1.id, itemId: item("EL-KLAV-01").id, quantity: 12, fulfilledQuantity: 0, unitPrice: 48 },
    { orderId: po2.id, itemId: item("HR-KAFE-1K").id, quantity: 40, unitPrice: 9.4 },
    { orderId: so1.id, itemId: item("OF-A4-500").id, quantity: 10, unitPrice: 6.5 },
    { orderId: so1.id, itemId: item("OF-HIM-SIN").id, quantity: 100, unitPrice: 0.6 },
  ]);

  const [sh1, sh2, sh3, sh4] = await db
    .insert(shipments)
    .values([
      { organizationId: O, reference: "ПЗ-2026-001/1", direction: "inbound", status: "delivered", locationId: main.id, orderId: po1.id, partnerId: techSupply.id, carrier: "Спиди", trackingNumber: "80014600003", expectedDate: iso(subDays(today, 4)), deliveredAt: subDays(today, 4), createdBy: admin.id },
      { organizationId: O, reference: "ПЗ-2026-001/2", direction: "inbound", status: "in_transit", locationId: main.id, orderId: po1.id, partnerId: techSupply.id, carrier: "Спиди", trackingNumber: "80014600117", expectedDate: iso(addDays(today, 3)), createdBy: admin.id },
      { organizationId: O, reference: "ПР-2026-001/1", direction: "outbound", status: "pending", locationId: main.id, orderId: so1.id, partnerId: officePoint.id, expectedDate: iso(subDays(today, 1)), createdBy: worker.id },
      { organizationId: O, reference: "ВХ-0042", direction: "inbound", status: "pending", locationId: shop.id, partner: "Доставка от ЕТ Иванов", expectedDate: iso(addDays(today, 1)), createdBy: worker.id },
    ])
    .returning();
  await db.insert(shipmentLines).values([
    { shipmentId: sh1.id, itemId: item("EL-HUB-7").id, quantity: 10 },
    { shipmentId: sh2.id, itemId: item("EL-HUB-7").id, quantity: 20 },
    { shipmentId: sh2.id, itemId: item("EL-KLAV-01").id, quantity: 12, lotNumber: Array.from({ length: 12 }, (_, i) => `KB-2026-1${String(i + 1).padStart(2, "0")}`).join(",") },
    { shipmentId: sh3.id, itemId: item("OF-A4-500").id, quantity: 10 },
    { shipmentId: sh3.id, itemId: item("OF-HIM-SIN").id, quantity: 100 },
    { shipmentId: sh4.id, itemId: item("EL-MISHKA-01").id, quantity: 10 },
  ]);
  await stockIn(item("EL-HUB-7").id, main.id, 10, 4, "Пратка ПЗ-2026-001/1");
  await db.update(stockMovements).set({ shipmentId: sh1.id }).where(sql`${stockMovements.reason} = 'Пратка ПЗ-2026-001/1'`);
  void studio;

  const [summer, starter] = await db
    .insert(collections)
    .values([
      { organizationId: O, name: "Лято 2026", color: "#f97316", description: "Сезонна линия облекло." },
      { organizationId: O, name: "Комплект за нов служител", color: "#0ea5e9", description: "Всичко, което новият колега получава в първия ден." },
    ])
    .returning();
  await db.insert(collectionItems).values([
    { collectionId: summer.id, itemId: tee.id },
    { collectionId: summer.id, itemId: item("OB-SUIT-SIV-L").id },
    { collectionId: starter.id, itemId: item("EL-MISHKA-01").id },
    { collectionId: starter.id, itemId: item("EL-KLAV-01").id },
    { collectionId: starter.id, itemId: item("EL-USBC-2M").id },
    { collectionId: starter.id, itemId: item("OF-HIM-SIN").id },
  ]);

  await db.insert(calendarEvents).values([
    { organizationId: O, title: "Месечна инвентаризация", date: iso(addDays(today, 5)), type: "reminder", notes: "Основен склад и магазин." },
    { organizationId: O, title: "Посещение на доставчик: ТехСъплай", date: iso(addDays(today, 8)), type: "event" },
    { organizationId: O, title: "Краен срок за ценова листа Q4", date: iso(addDays(today, 14)), type: "deadline" },
  ]);

  console.log(`Заредени: 2 организации, 2 потребители, ${rows.length + variants.length} артикула, 2 локации, 4 партньора, 3 поръчки, 4 пратки.`);
  console.log("Вход: admin@demo.bg / demo1234  ·  sklad@demo.bg / demo1234");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
