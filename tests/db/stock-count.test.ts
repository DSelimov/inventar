import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { items, lots, stockCountLines, stockCounts, stockLevels, stockMovements } from "@/db/tenant-schema";
import { applyMovement, type MovementInput } from "@/lib/stock";
import { addLotLine, applyStockCount, cancelStockCount, createStockCount, recordCount, saveCountedValues } from "@/lib/stock-count";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("count");
});
const actor = { id: 3, name: "Броител" };
const move = (input: Omit<MovementInput, "actor">) => t.db.transaction((tx) => applyMovement(tx, { actor, ...input }));
const level = async (itemId: number, locationId = t.main) => (await t.db.select().from(stockLevels).where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.locationId, locationId))))[0]?.quantity ?? 0;
const linesOf = (countId: number) => t.db.select().from(stockCountLines).where(eq(stockCountLines.countId, countId));

describe("инвентаризация", () => {
  it("снимка: артикули с наличност в локацията, партиди поотделно, нулевите само при includeZero", async () => {
    const a = await createItem(t.db, "none", { barcode: "2000000000017" });
    const zero = await createItem(t.db);
    const lotted = await createItem(t.db, "lot");
    await move({ itemId: a, locationId: t.main, type: "in", quantity: 10 });
    await move({ itemId: a, locationId: t.shop, type: "in", quantity: 99 }); // друга локация — не влиза
    await move({ itemId: lotted, locationId: t.main, type: "in", quantity: 4, lot: { lotNumber: "L-A" } });
    await move({ itemId: lotted, locationId: t.main, type: "in", quantity: 6, lot: { lotNumber: "L-B" } });

    const c = await createStockCount(t.db, { locationId: t.main, createdBy: "Тест" });
    const lines = await linesOf(c.id);
    expect(c.number).toMatch(/^ИНВ-\d{4}-\d{3}$/);
    expect(lines.find((l) => l.itemId === a)?.expected).toBe(10);
    expect(lines.filter((l) => l.itemId === lotted).map((l) => [l.lotNumber, l.expected]).sort()).toEqual([["L-A", 4], ["L-B", 6]]);
    expect(lines.some((l) => l.itemId === zero)).toBe(false);

    const withZero = await createStockCount(t.db, { locationId: t.main, includeZero: true, createdBy: "Тест" });
    expect((await linesOf(withZero.id)).find((l) => l.itemId === zero)?.expected).toBe(0);
  });

  it("сканиране: +1 по баркод, = задай по код, сериен номер, непознат и нов артикул, двусмислена партида", async () => {
    const a = await createItem(t.db, "none", { barcode: "2000000000024" });
    const lotted = await createItem(t.db, "lot", { sku: `LOT-${Date.now()}` });
    const serial = await createItem(t.db, "serial");
    const fresh = await createItem(t.db, "none", { sku: `NEW-${Date.now()}` }); // няма наличност → не е в списъка
    await move({ itemId: a, locationId: t.shop, type: "in", quantity: 5 });
    await move({ itemId: lotted, locationId: t.shop, type: "in", quantity: 2, lot: { lotNumber: "X1" } });
    await move({ itemId: lotted, locationId: t.shop, type: "in", quantity: 2, lot: { lotNumber: "X2" } });
    await move({ itemId: serial, locationId: t.shop, type: "in", quantity: 1, lot: { lotNumber: "SN-777" } });
    const c = await createStockCount(t.db, { locationId: t.shop, createdBy: "Тест" });

    await recordCount(t.db, c.id, "2000000000024", 1);
    await recordCount(t.db, c.id, "2000000000024", 1);
    expect((await recordCount(t.db, c.id, "2000000000024", 2)).line.counted).toBe(4);
    const sku = (await t.db.select().from(items).where(eq(items.id, a)))[0].sku;
    expect((await recordCount(t.db, c.id, sku, 5, "set")).line.counted).toBe(5);
    expect((await recordCount(t.db, c.id, "sn-777", 1)).line.counted).toBe(1);
    expect((await recordCount(t.db, c.id, "SN-777", 1)).line.counted).toBe(1); // сериен номер: най-много 1
    await expect(recordCount(t.db, c.id, "НЯМА-ТАКЪВ", 1)).rejects.toThrow("Няма артикул с код");
    const freshSku = (await t.db.select().from(items).where(eq(items.id, fresh)))[0].sku;
    const added = await recordCount(t.db, c.id, freshSku, 3);
    expect(added.line).toMatchObject({ itemId: fresh, expected: 0, counted: 3 });
    const lottedSku = (await t.db.select().from(items).where(eq(items.id, lotted)))[0].sku;
    await expect(recordCount(t.db, c.id, lottedSku, 1)).rejects.toThrow("сканирайте номера на партидата");
  });

  it("прилагане: разликата спрямо снимката се добавя към текущата наличност (движенията по време на броенето остават)", async () => {
    const a = await createItem(t.db, "none", { unitCost: 2 });
    await move({ itemId: a, locationId: t.main, type: "in", quantity: 10 });
    const c = await createStockCount(t.db, { locationId: t.main, createdBy: "Тест" });
    const line = (await linesOf(c.id)).find((l) => l.itemId === a)!;
    await saveCountedValues(t.db, c.id, new Map([[line.id, 8]])); // липсват 2
    await move({ itemId: a, locationId: t.main, type: "out", quantity: 3 }); // продажба по време на броенето → 7

    const r = await applyStockCount(t.db, c.id, actor);
    expect(await level(a)).toBe(5); // 7 + (8 − 10)
    expect(r.valueDelta).toBeLessThan(0);
    const [last] = await t.db.select().from(stockMovements).where(eq(stockMovements.itemId, a)).orderBy(stockMovements.id).then((m) => m.slice(-1));
    expect(last).toMatchObject({ type: "adjust", delta: -2, reason: `Инвентаризация ${c.number}` });
    expect((await t.db.select().from(stockCounts).where(eq(stockCounts.id, c.id)))[0]).toMatchObject({ status: "applied", appliedBy: "Броител" });
    await expect(applyStockCount(t.db, c.id, actor)).rejects.toThrow("вече е приключена");
    await expect(recordCount(t.db, c.id, "x", 1)).rejects.toThrow("вече е приключена");
  });

  it("партиди: излишък → приход в същата партида, липса → разход, нова партида → нов запис", async () => {
    const lotted = await createItem(t.db, "lot");
    await move({ itemId: lotted, locationId: t.main, type: "in", quantity: 10, lot: { lotNumber: "P1", expiryDate: "2027-06-30" } });
    await move({ itemId: lotted, locationId: t.main, type: "in", quantity: 5, lot: { lotNumber: "P2" } });
    const c = await createStockCount(t.db, { locationId: t.main, createdBy: "Тест" });
    await recordCount(t.db, c.id, "P1", 12, "set");
    await recordCount(t.db, c.id, "P2", 1, "set");
    await addLotLine(t.db, c.id, lotted, "P3", 4);
    await applyStockCount(t.db, c.id, actor);
    const rows = await t.db.select().from(lots).where(eq(lots.itemId, lotted));
    expect(Object.fromEntries(rows.map((l) => [l.lotNumber, l.quantity]))).toEqual({ P1: 12, P2: 1, P3: 4 });
    expect(rows.find((l) => l.lotNumber === "P1")?.expiryDate).toBe("2027-06-30");
    expect((await t.db.select().from(items).where(eq(items.id, lotted)))[0].quantity).toBe(17);
  });

  it("неброените: по подразбиране без промяна, с uncountedAsZero → 0; отказ не променя нищо", async () => {
    const a = await createItem(t.db);
    const b = await createItem(t.db);
    await move({ itemId: a, locationId: t.shop, type: "in", quantity: 7 });
    await move({ itemId: b, locationId: t.shop, type: "in", quantity: 3 });

    const skip = await createStockCount(t.db, { locationId: t.shop, createdBy: "Тест" });
    await applyStockCount(t.db, skip.id, actor);
    expect([await level(a, t.shop), await level(b, t.shop)]).toEqual([7, 3]);

    const zero = await createStockCount(t.db, { locationId: t.shop, createdBy: "Тест" });
    const lineA = (await linesOf(zero.id)).find((l) => l.itemId === a)!;
    await saveCountedValues(t.db, zero.id, new Map([[lineA.id, 7]]));
    await applyStockCount(t.db, zero.id, actor, { uncountedAsZero: true });
    expect([await level(a, t.shop), await level(b, t.shop)]).toEqual([7, 0]);

    const cancelled = await createStockCount(t.db, { locationId: t.shop, includeZero: true, createdBy: "Тест" });
    await cancelStockCount(t.db, cancelled.id);
    await expect(applyStockCount(t.db, cancelled.id, actor)).rejects.toThrow("вече е приключена");
  });

  it("грешка при една корекция отменя всички (транзакция)", async () => {
    const ok = await createItem(t.db);
    const lotted = await createItem(t.db, "lot");
    await move({ itemId: ok, locationId: t.main, type: "in", quantity: 5 });
    await move({ itemId: lotted, locationId: t.main, type: "in", quantity: 5, lot: { lotNumber: "Q1" } });
    const c = await createStockCount(t.db, { locationId: t.main, createdBy: "Тест" });
    const lines = await linesOf(c.id);
    await saveCountedValues(t.db, c.id, new Map([[lines.find((l) => l.itemId === ok)!.id, 9], [lines.find((l) => l.lotNumber === "Q1")!.id, 0]]));
    const [q1] = await t.db.select().from(lots).where(and(eq(lots.itemId, lotted), eq(lots.lotNumber, "Q1")));
    await move({ itemId: lotted, locationId: t.main, type: "out", quantity: 4, lot: { lotId: q1.id } }); // остава 1, а броенето иска да изпише 5
    await expect(applyStockCount(t.db, c.id, actor)).rejects.toThrow(/Недостатъчна наличност|има само/);
    expect(await level(ok)).toBe(5); // и другата корекция е отменена
    expect((await t.db.select().from(stockCounts).where(eq(stockCounts.id, c.id)))[0].status).toBe("open");
  });
});
