import { eq, inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { items } from "@/db/tenant-schema";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

let t: TestTenant;
beforeAll(async () => {
  t = await createTenant("money");
});

describe("пари в базата (decimal)", () => {
  it("4 знака се пазят точно, сумите в SQL са точни, връща се число", async () => {
    const a = await createItem(t.db, "none", { unitCost: 0.1, unitPrice: 1.2345, quantity: 1 });
    const b = await createItem(t.db, "none", { unitCost: 0.2, unitPrice: 9_999_999_999.9999, quantity: 1 });
    const [row] = await t.db.select().from(items).where(eq(items.id, a));
    expect(row.unitPrice).toBe(1.2345);
    expect(typeof row.unitCost).toBe("number");
    expect((await t.db.select().from(items).where(eq(items.id, b)))[0].unitPrice).toBe(9_999_999_999.9999);

    const [sum] = await t.db
      .select({ v: sql<number>`sum(${items.quantity} * ${items.unitCost})`.mapWith(Number) })
      .from(items)
      .where(inArray(items.id, [a, b]));
    expect(sum.v).toBe(0.3);
  });
});
