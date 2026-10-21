import { eq, sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { controlDb } from "@/db/control";
import { memberships, organizations, users } from "@/db/control-schema";
import { apiKeys } from "@/db/tenant-schema";
import { organizationExport } from "@/lib/org-export";
import { purgeOrganization } from "@/lib/org-deletion";
import { closeConnectionsAfterAll, createItem, createTenant, type TestTenant } from "../support/fixtures";

closeConnectionsAfterAll();
let t: TestTenant;
let gone: TestTenant;
beforeAll(async () => {
  [t, gone] = await Promise.all([createTenant("gdpr"), createTenant("purge")]);
});

describe("GDPR: експорт и изтриване", () => {
  it("експорт: CSV за всяка таблица, без тайните", async () => {
    await createItem(t.db, "none", { name: "Експортиран артикул" });
    await t.db.insert(apiKeys).values({ name: "ключ", prefix: "inv_abc", keyHash: "f".repeat(64), scopes: ["read"] });
    const files = unzipSync(new Uint8Array(await organizationExport(t.org, t.db)));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["README.txt", "data/items.csv", "data/stock_movements.csv", "data/invoices.csv", "data/api_keys.csv"]));
    expect(strFromU8(files["data/items.csv"])).toContain("Експортиран артикул");
    const keys = strFromU8(files["data/api_keys.csv"]);
    expect(keys).toContain("inv_abc");
    expect(keys).not.toContain("key_hash");
    expect(keys).not.toContain("f".repeat(64));
  });

  it("изтриване: базата, организацията и потребителят без други организации изчезват", async () => {
    const [{ id: userId }] = await controlDb.insert(users).values({ email: `gone-${gone.org.id}@test.bg`, name: "Бивш", passwordHash: "x" }).$returningId();
    await controlDb.insert(memberships).values({ userId, organizationId: gone.org.id, role: "owner" });
    const [org] = await controlDb.select().from(organizations).where(eq(organizations.id, gone.org.id));
    await purgeOrganization(org);
    expect(await controlDb.select().from(organizations).where(eq(organizations.id, gone.org.id))).toEqual([]);
    expect(await controlDb.select().from(users).where(eq(users.id, userId))).toEqual([]);
    const [rows] = (await t.db.execute(sql`select schema_name from information_schema.schemata where schema_name = ${gone.org.dbName}`)) as unknown as [unknown[]];
    expect(rows).toEqual([]);
  });
});
