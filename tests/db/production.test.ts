import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { items, lots, productionLines, stockMovements } from "@/db/tenant-schema";
import { planProduction, runProduction, saveRecipe, splitValue } from "@/lib/production";
import { scaleQty } from "@/lib/quantity";
import { applyMovement } from "@/lib/stock";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("prod");
});
const item = async (id: number) => (await t.db.query.items.findFirst({ where: eq(items.id, id) }))!;

describe("производство", () => {
  it("помощни: мащабиране на количества и разпределяне на стойност", () => {
    expect(scaleQty(0.25, 3, 1)).toBe(0.75);
    expect(scaleQty(1, 1, 3, 3)).toBe(0.333);
    expect(scaleQty(2, 5, 4, 0)).toBe(3); // 2,5 → 3
    expect(splitValue(10, [1, 1, 1])).toEqual([3.33, 3.33, 3.34]);
    expect(splitValue(9.99, [0, 0])).toEqual([5, 4.99]);
  });

  it("сглобяване: съставките се изписват по себестойност, произведеното влиза с нея; партиди по FEFO", async () => {
    const flour = await createItem(t.db, "none", { unit: "кг", quantityDecimals: 3 });
    const egg = await createItem(t.db, "lot", { unit: "бр." });
    const cake = await createItem(t.db, "lot", { unit: "бр." });
    await t.db.transaction(async (tx) => {
      await applyMovement(tx, { actor, itemId: flour, locationId: t.main, type: "in", quantity: 10, unitCost: 1.2 });
      await applyMovement(tx, { actor, itemId: egg, locationId: t.main, type: "in", quantity: 4, unitCost: 0.3, lot: { lotNumber: "L2", expiryDate: "2030-02-01" } });
      await applyMovement(tx, { actor, itemId: egg, locationId: t.main, type: "in", quantity: 4, unitCost: 0.25, lot: { lotNumber: "L1", expiryDate: "2030-01-01" } });
    });
    // рецепта: 2 торти от 0,5 кг брашно и 6 яйца
    const recipeId = await saveRecipe(t.db, null, { itemId: cake, name: "Торта", outputQuantity: 2, notes: null, active: true, lines: [{ itemId: flour, quantity: 0.5 }, { itemId: egg, quantity: 6 }] });
    const plan = await planProduction(t.db, { recipeId, quantity: 1, locationId: t.main, kind: "assembly" });
    expect(plan.lines.map((l) => l.quantity)).toEqual([0.25, 3]);

    const r = await runProduction(t.db, actor, { recipeId, quantity: 1, locationId: t.main, kind: "assembly" });
    expect(r.number).toMatch(/^ПРД-\d{4}-001$/);
    // 0,25 × 1,20 + 3 яйца (средна 0,275) = 0,30 + 0,825 = 1,125 → 1,13
    expect(r.totalCost).toBe(1.13);
    expect(await item(cake)).toMatchObject({ quantity: 1, unitCost: 1.13 });
    expect((await item(flour)).quantity).toBe(9.75);
    const eggLots = await t.db.select().from(lots).where(eq(lots.itemId, egg));
    expect(eggLots.find((l) => l.lotNumber === "L1")!.quantity).toBe(1); // първо изтичащата
    expect(eggLots.find((l) => l.lotNumber === "L2")!.quantity).toBe(4);
    const cakeLot = (await t.db.select().from(lots).where(eq(lots.itemId, cake)))[0];
    expect(cakeLot.lotNumber).toBe(r.number);
    const types = (await t.db.select().from(stockMovements).where(eq(stockMovements.reason, `Производство ${r.number}`))).map((m) => m.type).sort();
    expect(types).toEqual(["produce_in", "produce_out", "produce_out"]);

    await expect(runProduction(t.db, actor, { recipeId, quantity: 20, locationId: t.main, kind: "assembly" })).rejects.toThrow(/Недостатъчна наличност/);
    expect((await item(flour)).quantity).toBe(9.75); // транзакцията е върната
  });

  it("разглобяване: стойността на комплекта се разпределя по доставните цени на частите", async () => {
    const kit = await createItem(t.db);
    const a = await createItem(t.db, "none", { unitCost: 3 });
    const b = await createItem(t.db, "none", { unitCost: 1 });
    await t.db.transaction((tx) => applyMovement(tx, { actor, itemId: kit, locationId: t.main, type: "in", quantity: 2, unitCost: 10 }));
    const recipeId = await saveRecipe(t.db, null, { itemId: kit, name: "Комплект", outputQuantity: 1, notes: null, active: true, lines: [{ itemId: a, quantity: 1 }, { itemId: b, quantity: 2 }] });
    const r = await runProduction(t.db, actor, { recipeId, quantity: 1, locationId: t.main, kind: "disassembly" });
    expect(r.totalCost).toBe(10);
    // тегла 3 × 1 = 3 и 1 × 2 = 2 → 6,00 и 4,00
    const lines = await t.db.select().from(productionLines).where(eq(productionLines.productionId, r.id));
    expect(lines.filter((l) => l.direction === "in").map((l) => [l.itemId, l.value, l.unitCost])).toEqual([
      [a, 6, 6],
      [b, 4, 2],
    ]);
    expect(await item(kit)).toMatchObject({ quantity: 1 });
    expect(await item(b)).toMatchObject({ quantity: 2, unitCost: 2 });
  });

  it("рецепта: без собствения артикул, без повторения, количества по мерната единица", async () => {
    const x = await createItem(t.db);
    const y = await createItem(t.db);
    await expect(saveRecipe(t.db, null, { itemId: x, name: "R", outputQuantity: 1, notes: null, active: true, lines: [{ itemId: x, quantity: 1 }] })).rejects.toThrow("собствената");
    await expect(saveRecipe(t.db, null, { itemId: x, name: "R", outputQuantity: 1, notes: null, active: true, lines: [{ itemId: y, quantity: 1 }, { itemId: y, quantity: 2 }] })).rejects.toThrow("един ред");
    await expect(saveRecipe(t.db, null, { itemId: x, name: "R", outputQuantity: 1, notes: null, active: true, lines: [{ itemId: y, quantity: 0.5 }] })).rejects.toThrow();
  });
});
