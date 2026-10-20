/* Демонстрационни данни, за да не е празен интерфейсът при първо стартиране.  pnpm db:seed */
import { addDays, format, subDays } from "date-fns";
import { db } from "./index";
import {
  calendarEvents,
  categories,
  collectionItems,
  collections,
  fieldDefinitions,
  itemFieldValues,
  items,
  settings,
  shipmentLines,
  shipments,
  stockMovements,
} from "./schema";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const today = new Date();

async function main() {
  for (const t of [stockMovements, shipmentLines, shipments, collectionItems, collections, itemFieldValues, items, fieldDefinitions, categories, calendarEvents, settings]) {
    await db.delete(t);
  }

  await db.insert(settings).values([
    { key: "companyName", value: "Демо Трейдинг ЕООД" },
    { key: "currency", value: "EUR" },
    { key: "lowStockAlerts", value: "true" },
  ]);

  const [electronics, apparel, food, office] = await db
    .insert(categories)
    .values([
      { name: "Електроника", color: "#4f46e5", description: "Устройства, аксесоари и кабели." },
      { name: "Облекло", color: "#db2777", description: "Дрехи с размери и цветове." },
      { name: "Храни и напитки", color: "#16a34a", description: "Бързооборотни стоки със срок на годност." },
      { name: "Офис консумативи", color: "#f59e0b", description: "Хартия, пишещи средства и консумативи." },
    ])
    .returning();

  const fields = await db
    .insert(fieldDefinitions)
    .values([
      { categoryId: electronics.id, name: "Марка", type: "text", sortOrder: 0 },
      { categoryId: electronics.id, name: "Гаранция (месеци)", type: "number", sortOrder: 1 },
      { categoryId: electronics.id, name: "Сериен номер", type: "boolean", sortOrder: 2 },
      { categoryId: apparel.id, name: "Размер", type: "select", options: JSON.stringify(["XS", "S", "M", "L", "XL"]), required: true, sortOrder: 0 },
      { categoryId: apparel.id, name: "Цвят", type: "text", sortOrder: 1 },
      { categoryId: food.id, name: "Срок на годност", type: "date", required: true, sortOrder: 0 },
      { categoryId: food.id, name: "Съхранение", type: "select", options: JSON.stringify(["Стайна температура", "Хладилно", "Замразено"]), sortOrder: 1 },
    ])
    .returning();
  const f = (name: string) => fields.find((x) => x.name === name)!.id;

  const rows = await db
    .insert(items)
    .values([
      { sku: "EL-MISHKA-01", name: "Безжична мишка", categoryId: electronics.id, quantity: 42, minQuantity: 10, unitCost: 12.5, unitPrice: 24.9, location: "А-01" },
      { sku: "EL-KLAV-01", name: "Механична клавиатура", categoryId: electronics.id, quantity: 8, minQuantity: 10, unitCost: 48, unitPrice: 89, location: "А-02" },
      { sku: "EL-USBC-2M", name: "USB-C кабел 2 м", categoryId: electronics.id, quantity: 150, minQuantity: 40, unitCost: 2.1, unitPrice: 7.9, location: "А-03" },
      { sku: "EL-HUB-7", name: "USB хъб 7 порта", categoryId: electronics.id, quantity: 0, minQuantity: 5, unitCost: 19, unitPrice: 39, location: "А-04" },
      { sku: "OB-TEE-CHER-M", name: "Тениска черна", categoryId: apparel.id, quantity: 64, minQuantity: 20, unitCost: 4.2, unitPrice: 14.9, location: "Б-10" },
      { sku: "OB-SUIT-SIV-L", name: "Суитшърт сив", categoryId: apparel.id, quantity: 17, minQuantity: 15, unitCost: 15.8, unitPrice: 44.9, location: "Б-11" },
      { sku: "OB-SHAPKA-SIN", name: "Шапка с козирка синя", categoryId: apparel.id, quantity: 30, minQuantity: 10, unitCost: 3.9, unitPrice: 12.9, location: "Б-12" },
      { sku: "HR-KAFE-1K", name: "Кафе на зърна 1 кг", categoryId: food.id, quantity: 25, minQuantity: 10, unit: "пакет", unitCost: 9.4, unitPrice: 17.9, location: "В-01" },
      { sku: "HR-VODA-05", name: "Минерална вода 0,5 л", categoryId: food.id, quantity: 480, minQuantity: 120, unit: "бут.", unitCost: 0.22, unitPrice: 0.9, location: "В-02" },
      { sku: "OF-A4-500", name: "Копирна хартия А4, 500 л.", categoryId: office.id, quantity: 36, minQuantity: 12, unit: "пакет", unitCost: 3.6, unitPrice: 6.5, location: "Г-01" },
      { sku: "OF-HIM-SIN", name: "Химикалка синя", categoryId: office.id, quantity: 210, minQuantity: 50, unitCost: 0.18, unitPrice: 0.6, location: "Г-02" },
      { sku: "OF-TONER-85A", name: "Тонер касета 85A", categoryId: office.id, quantity: 3, minQuantity: 4, unitCost: 41, unitPrice: 69, location: "Г-03" },
    ])
    .returning();
  const item = (sku: string) => rows.find((r) => r.sku === sku)!;

  await db.insert(itemFieldValues).values([
    { itemId: item("EL-MISHKA-01").id, fieldId: f("Марка"), value: "Logi" },
    { itemId: item("EL-MISHKA-01").id, fieldId: f("Гаранция (месеци)"), value: "24" },
    { itemId: item("EL-KLAV-01").id, fieldId: f("Марка"), value: "Keychron" },
    { itemId: item("EL-KLAV-01").id, fieldId: f("Сериен номер"), value: "true" },
    { itemId: item("OB-TEE-CHER-M").id, fieldId: f("Размер"), value: "M" },
    { itemId: item("OB-TEE-CHER-M").id, fieldId: f("Цвят"), value: "Черен" },
    { itemId: item("OB-SUIT-SIV-L").id, fieldId: f("Размер"), value: "L" },
    { itemId: item("OB-SUIT-SIV-L").id, fieldId: f("Цвят"), value: "Сив" },
    { itemId: item("HR-KAFE-1K").id, fieldId: f("Срок на годност"), value: iso(addDays(today, 120)) },
    { itemId: item("HR-KAFE-1K").id, fieldId: f("Съхранение"), value: "Стайна температура" },
    { itemId: item("HR-VODA-05").id, fieldId: f("Срок на годност"), value: iso(addDays(today, 365)) },
  ]);

  await db.insert(stockMovements).values(
    rows
      .filter((r) => r.quantity > 0)
      .map((r) => ({ itemId: r.id, type: "in" as const, delta: r.quantity, quantityAfter: r.quantity, reason: "Начална наличност", createdAt: subDays(today, 30).toISOString() })),
  );
  await db.insert(stockMovements).values([
    { itemId: item("EL-MISHKA-01").id, type: "out", delta: -6, quantityAfter: 42, reason: "Продажба №1042", createdAt: subDays(today, 3).toISOString() },
    { itemId: item("EL-HUB-7").id, type: "out", delta: -5, quantityAfter: 0, reason: "Продажба №1051", createdAt: subDays(today, 1).toISOString() },
    { itemId: item("OF-TONER-85A").id, type: "adjust", delta: -1, quantityAfter: 3, reason: "Инвентаризация: една повредена", createdAt: subDays(today, 2).toISOString() },
  ]);

  const [po1, po2, so1, so2] = await db
    .insert(shipments)
    .values([
      { reference: "ПЗ-2026-014", direction: "inbound", status: "pending", partner: "ТехСъплай ООД", carrier: "Спиди", trackingNumber: "80014600003", expectedDate: iso(addDays(today, 3)) },
      { reference: "ПЗ-2026-015", direction: "inbound", status: "in_transit", partner: "Кафе Братя ЕООД", carrier: "Еконт", trackingNumber: "1050123456789", expectedDate: iso(addDays(today, 1)) },
      { reference: "ПР-2026-102", direction: "outbound", status: "pending", partner: "Офис Пойнт ООД", expectedDate: iso(subDays(today, 1)), notes: "Клиентът помоли за доставка преди обяд." },
      { reference: "ПР-2026-099", direction: "outbound", status: "delivered", partner: "Студио Норд", carrier: "Собствен транспорт", expectedDate: iso(subDays(today, 4)), deliveredAt: subDays(today, 4).toISOString() },
    ])
    .returning();

  await db.insert(shipmentLines).values([
    { shipmentId: po1.id, itemId: item("EL-HUB-7").id, quantity: 20 },
    { shipmentId: po1.id, itemId: item("EL-KLAV-01").id, quantity: 12 },
    { shipmentId: po2.id, itemId: item("HR-KAFE-1K").id, quantity: 40 },
    { shipmentId: so1.id, itemId: item("OF-A4-500").id, quantity: 10 },
    { shipmentId: so1.id, itemId: item("OF-HIM-SIN").id, quantity: 100 },
    { shipmentId: so2.id, itemId: item("OB-TEE-CHER-M").id, quantity: 16 },
  ]);
  await db.insert(stockMovements).values({
    itemId: item("OB-TEE-CHER-M").id, type: "out", delta: -16, quantityAfter: 64, reason: "Пратка ПР-2026-099", shipmentId: so2.id, createdAt: subDays(today, 4).toISOString(),
  });

  const [summer, starter] = await db
    .insert(collections)
    .values([
      { name: "Лято 2026", color: "#f97316", description: "Сезонна линия облекло." },
      { name: "Комплект за нов служител", color: "#0ea5e9", description: "Всичко, което новият колега получава в първия ден." },
    ])
    .returning();
  await db.insert(collectionItems).values([
    { collectionId: summer.id, itemId: item("OB-TEE-CHER-M").id },
    { collectionId: summer.id, itemId: item("OB-SHAPKA-SIN").id },
    { collectionId: starter.id, itemId: item("EL-MISHKA-01").id },
    { collectionId: starter.id, itemId: item("EL-KLAV-01").id },
    { collectionId: starter.id, itemId: item("EL-USBC-2M").id },
    { collectionId: starter.id, itemId: item("OF-HIM-SIN").id },
  ]);

  await db.insert(calendarEvents).values([
    { title: "Месечна инвентаризация", date: iso(addDays(today, 5)), type: "reminder", notes: "Склад А и Б." },
    { title: "Посещение на доставчик: ТехСъплай", date: iso(addDays(today, 8)), type: "event" },
    { title: "Краен срок за ценова листа Q4", date: iso(addDays(today, 14)), type: "deadline" },
  ]);

  console.log(`Заредени ${rows.length} артикула, 4 категории, 4 пратки, 2 колекции.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
