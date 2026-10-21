import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { items, lots, stockMovements, writeOffLines } from "@/db/tenant-schema";
import { nextNumber, peekNumber } from "@/lib/numbering";
import { applyMovement, type MovementInput } from "@/lib/stock";
import { applyWriteOff, cancelWriteOff, createWriteOff } from "@/lib/write-offs";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("wo");
});
const move = (input: Omit<MovementInput, "actor">) => t.db.transaction((tx) => applyMovement(tx, { actor, ...input }));

describe("поредни номера", () => {
  it("паралелно: без повторения и без дупки; отменена транзакция връща номера; нова година от 001", async () => {
    const numbers = await Promise.all(Array.from({ length: 8 }, () => t.db.transaction((tx) => nextNumber(tx, "sales", 2031))));
    expect(numbers.sort()).toEqual(Array.from({ length: 8 }, (_, i) => `ПР-2031-${String(i + 1).padStart(3, "0")}`));

    await expect(
      t.db.transaction(async (tx) => {
        await nextNumber(tx, "sales", 2031);
        throw new Error("отказ");
      }),
    ).rejects.toThrow("отказ");
    expect(await peekNumber(t.db, "sales", 2031)).toBe("ПР-2031-009");
    expect(await t.db.transaction((tx) => nextNumber(tx, "sales", 2032))).toBe("ПР-2032-001");
    expect(await t.db.transaction((tx) => nextNumber(tx, "purchase", 2031))).toBe("ПЗ-2031-001");
  });
});

describe("протокол за брак", () => {
  it("чернова не пипа наличността; прилагането изписва по средната цена и записва стойността; само веднъж", async () => {
    const plain = await createItem(t.db);
    const lotted = await createItem(t.db, "lot");
    await move({ itemId: plain, locationId: t.main, type: "in", quantity: 10, unitCost: 4 });
    await move({ itemId: plain, locationId: t.main, type: "in", quantity: 10, unitCost: 6 });
    await move({ itemId: lotted, locationId: t.main, type: "in", quantity: 5, unitCost: 2, lot: { lotNumber: "Л-1" } });
    const [lot] = await t.db.select().from(lots).where(eq(lots.itemId, lotted));

    await expect(createWriteOff(t.db, { locationId: t.main, reason: "Повреда", lines: [{ itemId: lotted, lotId: null, quantity: 1 }] }, "Тест")).rejects.toThrow("партида");
    const wo = await createWriteOff(t.db, { locationId: t.main, reason: "Изтекъл срок", commission: "Иван\nМария", lines: [{ itemId: plain, lotId: null, quantity: 3 }, { itemId: lotted, lotId: lot.id, quantity: 2 }] }, "Тест");
    expect(wo.number).toMatch(/^БР-\d{4}-001$/);
    expect((await t.db.select().from(items).where(eq(items.id, plain)))[0].quantity).toBe(20);

    const [first, second] = await Promise.allSettled([applyWriteOff(t.db, wo.id, actor), applyWriteOff(t.db, wo.id, actor)]);
    expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
    const r = (first.status === "fulfilled" ? first : second) as PromiseFulfilledResult<{ value: number }>;
    expect(r.value.value).toBe(19); // 3 × 5 (средна) + 2 × 2

    expect((await t.db.select().from(items).where(eq(items.id, plain)))[0].quantity).toBe(17);
    expect((await t.db.select().from(lots).where(eq(lots.id, lot.id)))[0].quantity).toBe(3);
    const lines = await t.db.select().from(writeOffLines).where(eq(writeOffLines.writeOffId, wo.id)).orderBy(writeOffLines.id);
    expect(lines.map((l) => [l.unitCost, l.value])).toEqual([
      [5, 15],
      [2, 4],
    ]);
    const [m] = await t.db.select().from(stockMovements).where(eq(stockMovements.itemId, plain)).orderBy(stockMovements.id).limit(1).offset(2);
    expect(m).toMatchObject({ type: "write_off", delta: -3, value: -15 });
    expect(m.reason).toContain(wo.number);

    await expect(cancelWriteOff(t.db, wo.id)).rejects.toThrow("Само чернова");
  });

  it("недостатъчна наличност: нищо не се изписва и протоколът остава чернова", async () => {
    const id = await createItem(t.db);
    await move({ itemId: id, locationId: t.main, type: "in", quantity: 1 });
    const wo = await createWriteOff(t.db, { locationId: t.main, reason: "Липса", lines: [{ itemId: id, lotId: null, quantity: 5 }] }, "Тест");
    await expect(applyWriteOff(t.db, wo.id, actor)).rejects.toThrow(/Недостатъчна/);
    await cancelWriteOff(t.db, wo.id); // все още е чернова
  });
});
