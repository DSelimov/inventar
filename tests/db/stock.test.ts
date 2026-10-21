import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { items, lots, stockLevels, stockMovements } from "@/db/tenant-schema";
import { applyMovement, transferStock, type MovementInput } from "@/lib/stock";
import { emit } from "@/lib/webhooks";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("stock");
});
beforeEach(() => vi.mocked(emit).mockClear());

const actor = { id: 1, name: "Тест" };
const move = (input: Omit<MovementInput, "actor">) => t.db.transaction((tx) => applyMovement(tx, { actor, ...input }));

async function level(itemId: number, locationId: number) {
  const [row] = await t.db.select().from(stockLevels).where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.locationId, locationId)));
  return row?.quantity ?? 0;
}
async function total(itemId: number) {
  const [row] = await t.db.select({ q: items.quantity }).from(items).where(eq(items.id, itemId));
  return row.q;
}
const movements = (itemId: number) => t.db.select().from(stockMovements).where(eq(stockMovements.itemId, itemId)).orderBy(stockMovements.id);
const lotsOf = (itemId: number) => t.db.select().from(lots).where(eq(lots.itemId, itemId)).orderBy(lots.id);

describe("applyMovement — без проследяване", () => {
  it("приход, разход и точно количество обновяват локацията, общата наличност и историята", async () => {
    const id = await createItem(t.db);
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 10, reason: "Доставка" });
    await move({ itemId: id, locationId: t.shop, type: "in", quantity: 5 });
    await move({ itemId: id, locationId: t.main, type: "out", quantity: 3 });
    expect(await level(id, t.main)).toBe(7);
    expect(await level(id, t.shop)).toBe(5);
    expect(await total(id)).toBe(12);

    const result = await move({ itemId: id, locationId: t.main, type: "adjust", quantity: 4 });
    expect(result).toEqual({ delta: -3, after: 9 });
    expect(await level(id, t.main)).toBe(4);

    const rows = await movements(id);
    expect(rows.map((m) => [m.type, m.delta, m.quantityAfter])).toEqual([
      ["in", 10, 10],
      ["in", 5, 15],
      ["out", -3, 12],
      ["adjust", -3, 9],
    ]);
    expect(rows[0]).toMatchObject({ userId: 1, userName: "Тест", reason: "Доставка", locationId: t.main });
  });

  it("корекция до същото количество не създава движение", async () => {
    const id = await createItem(t.db);
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 2 });
    expect(await move({ itemId: id, locationId: t.main, type: "adjust", quantity: 2 })).toEqual({ delta: 0, after: 2 });
    expect(await movements(id)).toHaveLength(1);
  });

  it("недостатъчна наличност в локацията се отказва и нищо не се променя", async () => {
    const id = await createItem(t.db);
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 2 });
    await move({ itemId: id, locationId: t.shop, type: "in", quantity: 10 });
    // общо има 12, но в main само 2
    await expect(move({ itemId: id, locationId: t.main, type: "out", quantity: 3 })).rejects.toThrow("Недостатъчна наличност в локацията (има 2");
    expect(await level(id, t.main)).toBe(2);
    expect(await total(id)).toBe(12);
    expect(await movements(id)).toHaveLength(2);
  });

  it("отрицателно, дробно количество и непознат артикул се отказват", async () => {
    const id = await createItem(t.db);
    await expect(move({ itemId: id, locationId: t.main, type: "in", quantity: -1 })).rejects.toThrow("не може да е отрицателно");
    await expect(move({ itemId: id, locationId: t.main, type: "in", quantity: 1.5 })).rejects.toThrow("въведете цяло число");
    await expect(move({ itemId: 999_999, locationId: t.main, type: "in", quantity: 1 })).rejects.toThrow("Артикулът не е намерен");
  });

  it("сигнал за ниска наличност само при пресичане на минимума", async () => {
    const id = await createItem(t.db, "none", { minQuantity: 5 });
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 10 });
    await move({ itemId: id, locationId: t.main, type: "out", quantity: 4 }); // 6 > 5
    await move({ itemId: id, locationId: t.main, type: "out", quantity: 2 }); // 4 ≤ 5 → сигнал
    await move({ itemId: id, locationId: t.main, type: "out", quantity: 1 }); // вече под минимума → без нов сигнал
    const low = vi.mocked(emit).mock.calls.filter((c) => c[1] === "item.low_stock");
    expect(low).toHaveLength(1);
    expect(low[0][2]).toMatchObject({ itemId: id, quantity: 4, minQuantity: 5 });
    expect(vi.mocked(emit).mock.calls.filter((c) => c[1] === "movement.created")).toHaveLength(4);
  });
});

describe("applyMovement — партиди", () => {
  it("приход създава партида; същата партида в същата локация се добавя", async () => {
    const id = await createItem(t.db, "lot");
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 10, lot: { lotNumber: "L1", expiryDate: "2027-01-31" } });
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 5, lot: { lotNumber: "L1" } });
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 3, lot: { lotNumber: "L2" } });
    const rows = await lotsOf(id);
    expect(rows.map((l) => [l.lotNumber, l.quantity, l.expiryDate])).toEqual([
      ["L1", 15, "2027-01-31"],
      ["L2", 3, null],
    ]);
    expect(await total(id)).toBe(18);
    expect((await movements(id)).map((m) => m.lotId)).toEqual([rows[0].id, rows[0].id, rows[1].id]);
  });

  it("приход без номер на партида и корекция се отказват", async () => {
    const id = await createItem(t.db, "lot");
    await expect(move({ itemId: id, locationId: t.main, type: "in", quantity: 1 })).rejects.toThrow("Въведете партида");
    await expect(move({ itemId: id, locationId: t.main, type: "adjust", quantity: 1 })).rejects.toThrow("използвайте приход или разход с партида");
  });

  it("разход изисква партида от същата локация, от същия артикул и с достатъчно количество", async () => {
    const id = await createItem(t.db, "lot");
    const other = await createItem(t.db, "lot");
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 10, lot: { lotNumber: "A" } });
    await move({ itemId: id, locationId: t.shop, type: "in", quantity: 10, lot: { lotNumber: "B" } });
    await move({ itemId: other, locationId: t.main, type: "in", quantity: 10, lot: { lotNumber: "X" } });
    const [a, b] = await lotsOf(id);
    const [x] = await lotsOf(other);

    await expect(move({ itemId: id, locationId: t.main, type: "out", quantity: 1 })).rejects.toThrow("Изберете партида");
    await expect(move({ itemId: id, locationId: t.main, type: "out", quantity: 1, lot: { lotId: b.id } })).rejects.toThrow("не е в тази локация");
    // партида на друг артикул не може да се използва (IDOR)
    await expect(move({ itemId: id, locationId: t.main, type: "out", quantity: 1, lot: { lotId: x.id } })).rejects.toThrow("не е в тази локация");
    // в локацията има 15 (A + A2), но в партида A само 10
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 5, lot: { lotNumber: "A2" } });
    await expect(move({ itemId: id, locationId: t.main, type: "out", quantity: 11, lot: { lotId: a.id } })).rejects.toThrow("В партида A има само 10");

    await move({ itemId: id, locationId: t.main, type: "out", quantity: 4, lot: { lotId: a.id } });
    expect((await lotsOf(id)).map((l) => l.quantity)).toEqual([6, 10, 5]);
    expect((await lotsOf(other))[0].quantity).toBe(10);
    expect(await total(id)).toBe(21);
  });
});

describe("applyMovement — серийни номера", () => {
  it("приход: броят номера трябва да е равен на количеството; номер в наличност не се приема повторно", async () => {
    const id = await createItem(t.db, "serial");
    await expect(move({ itemId: id, locationId: t.main, type: "in", quantity: 3, lot: { lotNumber: "S1, S2" } })).rejects.toThrow("Броят серийни номера (2)");
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 3, lot: { lotNumber: "S1, S2\nS3" } });
    expect((await lotsOf(id)).map((l) => [l.serialNumber, l.quantity])).toEqual([
      ["S1", 1],
      ["S2", 1],
      ["S3", 1],
    ]);
    await expect(move({ itemId: id, locationId: t.main, type: "in", quantity: 1, lot: { lotNumber: "S2" } })).rejects.toThrow("S2 вече е в наличност");
    expect(await total(id)).toBe(3);
  });

  it("продаден сериен номер може да се получи отново (връщане)", async () => {
    const id = await createItem(t.db, "serial");
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 1, lot: { lotNumber: "SN-9" } });
    const [lot] = await lotsOf(id);
    await move({ itemId: id, locationId: t.main, type: "out", quantity: 1, lot: { lotId: lot.id } });
    expect((await lotsOf(id))[0].quantity).toBe(0);
    await move({ itemId: id, locationId: t.shop, type: "in", quantity: 1, lot: { lotNumber: "SN-9" } });
    const after = await lotsOf(id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ quantity: 1, locationId: t.shop });
  });
});

describe("transferStock", () => {
  it("без проследяване: местата се сменят, общата наличност остава, две движения", async () => {
    const id = await createItem(t.db);
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 10 });
    await transferStock(t.db, { actor, itemId: id, fromLocationId: t.main, toLocationId: t.shop, quantity: 4 });
    expect(await level(id, t.main)).toBe(6);
    expect(await level(id, t.shop)).toBe(4);
    expect(await total(id)).toBe(10);
    expect((await movements(id)).slice(1).map((m) => [m.type, m.delta, m.locationId])).toEqual([
      ["transfer_out", -4, t.main],
      ["transfer_in", 4, t.shop],
    ]);
  });

  it("една и съща локация и недостатъчно количество се отказват без частични промени", async () => {
    const id = await createItem(t.db);
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 2 });
    await expect(transferStock(t.db, { actor, itemId: id, fromLocationId: t.main, toLocationId: t.main, quantity: 1 })).rejects.toThrow("две различни локации");
    await expect(transferStock(t.db, { actor, itemId: id, fromLocationId: t.main, toLocationId: t.shop, quantity: 3 })).rejects.toThrow("Недостатъчна наличност");
    expect(await level(id, t.main)).toBe(2);
    expect(await level(id, t.shop)).toBe(0);
    expect(await movements(id)).toHaveLength(1);
  });

  it("партида: пренася се със същия номер и срок в новата локация", async () => {
    const id = await createItem(t.db, "lot");
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 10, lot: { lotNumber: "EXP-1", expiryDate: "2027-03-01" } });
    const [lot] = await lotsOf(id);
    await transferStock(t.db, { actor, itemId: id, fromLocationId: t.main, toLocationId: t.shop, quantity: 6, lotId: lot.id });
    const rows = await lotsOf(id);
    expect(rows.map((l) => [l.lotNumber, l.locationId, l.quantity, l.expiryDate])).toEqual([
      ["EXP-1", t.main, 4, "2027-03-01"],
      ["EXP-1", t.shop, 6, "2027-03-01"],
    ]);
    expect(await total(id)).toBe(10);
  });

  it("сериен номер се премества в другата локация", async () => {
    const id = await createItem(t.db, "serial");
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 2, lot: { lotNumber: "A1,A2" } });
    const [a1] = await lotsOf(id);
    await transferStock(t.db, { actor, itemId: id, fromLocationId: t.main, toLocationId: t.shop, quantity: 1, lotId: a1.id });
    const rows = await lotsOf(id);
    expect(rows.find((l) => l.serialNumber === "A1")).toMatchObject({ locationId: t.shop, quantity: 1 });
    expect(await level(id, t.main)).toBe(1);
    expect(await level(id, t.shop)).toBe(1);
  });
});

describe("дробни количества (кг, л)", () => {
  it("приход, разход, корекция и трансфер с хилядни — точно, без плаваща запетая", async () => {
    const id = await createItem(t.db, "none", { unit: "кг", quantityDecimals: 3 });
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 0.1 });
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 0.2 });
    const [after] = await t.db.select().from(items).where(eq(items.id, id));
    expect(after.quantity).toBe(0.3);
    await move({ itemId: id, locationId: t.main, type: "out", quantity: 0.125 });
    await transferStock(t.db, { actor, itemId: id, fromLocationId: t.main, toLocationId: t.shop, quantity: 0.075 });
    expect((await t.db.select().from(items).where(eq(items.id, id)))[0].quantity).toBe(0.175);
    await move({ itemId: id, locationId: t.shop, type: "adjust", quantity: 1.5 });
    expect((await t.db.select().from(items).where(eq(items.id, id)))[0].quantity).toBe(1.6);
    await expect(move({ itemId: id, locationId: t.main, type: "in", quantity: 0.0005 })).rejects.toThrow("най-много 3 знака");
  });

  it("брой знаци според артикула; партиди с дробно количество; серийните номера остават цели", async () => {
    const oneDecimal = await createItem(t.db, "none", { unit: "л", quantityDecimals: 1 });
    await expect(move({ itemId: oneDecimal, locationId: t.main, type: "in", quantity: 2.25 })).rejects.toThrow("най-много 1 знак");
    await move({ itemId: oneDecimal, locationId: t.main, type: "in", quantity: 2.5 });

    const lotted = await createItem(t.db, "lot", { unit: "кг", quantityDecimals: 3 });
    await move({ itemId: lotted, locationId: t.main, type: "in", quantity: 12.5, lot: { lotNumber: "КГ-1" } });
    const [lot] = await t.db.select().from(lots).where(eq(lots.itemId, lotted));
    await move({ itemId: lotted, locationId: t.main, type: "out", quantity: 0.75, lot: { lotId: lot.id } });
    expect((await t.db.select().from(lots).where(eq(lots.id, lot.id)))[0].quantity).toBe(11.75);

    const serial = await createItem(t.db, "serial", { quantityDecimals: 3 }); // настройката се пренебрегва
    await expect(move({ itemId: serial, locationId: t.main, type: "in", quantity: 0.5, lot: { lotNumber: "SN-X" } })).rejects.toThrow("въведете цяло число");
  });
});
