import { beforeAll, describe, expect, it, vi } from "vitest";
import { assertMinPrices } from "@/lib/order-rules";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("minprice");
});

describe("минимална продажна цена", () => {
  it("служител не продава под минимума; администратор може; доставките не се проверяват; валута по курса", async () => {
    const item = await createItem(t.db, "none", { unitPrice: 20, minPrice: 15 });
    const free = await createItem(t.db, "none", { unitPrice: 5 });
    const staff = { db: t.db, role: "staff" as const };
    await expect(assertMinPrices(staff, "sales", [{ itemId: item, unitPrice: 14.99 }], {})).rejects.toThrow("Под минималната цена");
    await expect(assertMinPrices(staff, "sales", [{ itemId: item, unitPrice: 15 }, { itemId: free, unitPrice: 0.1 }], {})).resolves.toBeUndefined();
    await expect(assertMinPrices({ db: t.db, role: "admin" }, "sales", [{ itemId: item, unitPrice: 1 }], {})).resolves.toBeUndefined();
    await expect(assertMinPrices(staff, "purchase", [{ itemId: item, unitPrice: 1 }], {})).resolves.toBeUndefined();
    // 16 USD × 0,92 = 14,72 € < 15 €
    await expect(assertMinPrices(staff, "sales", [{ itemId: item, unitPrice: 16 }], { currency: "USD", exchangeRate: 0.92 })).rejects.toThrow();
    await expect(assertMinPrices(staff, "sales", [{ itemId: item, unitPrice: 17 }], { currency: "USD", exchangeRate: 0.92 })).resolves.toBeUndefined();
  });
});
