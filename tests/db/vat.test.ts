import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { categories, vatRates } from "@/db/tenant-schema";
import { assignVat, defaultVatRate } from "@/lib/vat-rates";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

describe("ставки ДДС", () => {
  let t: TestTenant;
  beforeAll(async () => {
    t = await createTenant("vat");
  });

  it("нова организация има 20 % (по подразбиране), 9 %, 0 % с основание", async () => {
    const rates = await t.db.select().from(vatRates);
    expect(rates.map((r) => r.rate).sort((a, b) => b - a)).toEqual([20, 9, 0, 0, 0]);
    expect((await defaultVatRate(t.db))?.rate).toBe(20);
    expect(rates.filter((r) => r.rate === 0).every((r) => r.legalBasis)).toBe(true);
  });

  it("избрана ставка → на артикула → на категорията → по подразбиране; неактивна се отказва", async () => {
    const rates = await t.db.select().from(vatRates);
    const nine = rates.find((r) => r.rate === 9)!;
    const zero = rates.find((r) => r.rate === 0)!;
    const [{ id: cat }] = await t.db.insert(categories).values({ name: "Книги", vatRateId: nine.id }).$returningId();
    const plain = await createItem(t.db);
    const inCategory = await createItem(t.db, "none", { categoryId: cat });
    const own = await createItem(t.db, "none", { categoryId: cat, vatRateId: zero.id });

    const out = await assignVat(t.db, [{ itemId: plain }, { itemId: inCategory }, { itemId: own }, { itemId: plain, vatRateId: nine.id }]);
    expect(out.map((l) => l.vatRate)).toEqual([20, 9, 0, 9]);

    await t.db.update(vatRates).set({ active: false }).where(eq(vatRates.id, nine.id));
    await expect(assignVat(t.db, [{ itemId: plain, vatRateId: nine.id }])).rejects.toThrow("неактивна");
  });
});
