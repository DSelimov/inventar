import { beforeAll, describe, expect, it, vi } from "vitest";
import { stockCountLines } from "@/db/tenant-schema";
import { eq } from "drizzle-orm";
import { findItemByCode } from "@/lib/queries";
import { SCALE_FORMATS_KEY } from "@/lib/scale";
import { DEFAULT_SCALE_FORMATS, eanCheckDigit } from "@/lib/scale-barcode";
import { setSetting } from "@/lib/settings";
import { createStockCount, recordCount } from "@/lib/stock-count";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const ean = (first12: string) => first12 + eanCheckDigit(first12);
let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("scale");
});

describe("етикети от везни", () => {
  it("сканиране: артикулът по PLU, количеството от теглото или от цената", async () => {
    const cheese = await createItem(t.db, "none", { plu: "123", unit: "кг", quantityDecimals: 3, unitPrice: 12.5 });
    const code = ean("280012301250");
    expect(await findItemByCode(t.db, code)).toBeUndefined(); // без формати — не се разпознава
    await setSetting(t.db, SCALE_FORMATS_KEY, JSON.stringify(DEFAULT_SCALE_FORMATS));
    const byWeight = await findItemByCode(t.db, code);
    expect(byWeight).toMatchObject({ id: cheese, scale: { kind: "weight", value: 1.25, quantity: 1.25 } });
    const byPrice = await findItemByCode(t.db, ean("290012300625"));
    expect(byPrice).toMatchObject({ id: cheese, scale: { kind: "price", value: 6.25, quantity: 0.5 } });
    expect(await findItemByCode(t.db, ean("280099901000"))).toBeUndefined(); // няма такъв PLU
  });

  it("инвентаризация: етикетът добавя теглото", async () => {
    const ham = await createItem(t.db, "none", { plu: "77", unit: "кг", quantityDecimals: 3 });
    const count = await createStockCount(t.db, { locationId: t.main, includeZero: true, createdBy: "Тест" });
    const id = typeof count === "number" ? count : (count as { id: number }).id;
    await recordCount(t.db, id, ean("280007700750"), 1);
    await recordCount(t.db, id, ean("280007701000"), 1);
    const [line] = await t.db.select().from(stockCountLines).where(eq(stockCountLines.itemId, ham));
    expect(line.counted).toBe(1.75);
  });
});
