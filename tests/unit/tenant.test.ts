import { describe, expect, it } from "vitest";
import { isValidSubdomain, subdomainFromHost, tenantUrl } from "@/lib/tenant";

// APP_DOMAIN=inventar.test (vitest.config.ts)
describe("subdomainFromHost", () => {
  it("поддомейн на APP_DOMAIN", () => {
    expect(subdomainFromHost("demo.inventar.test")).toBe("demo");
    expect(subdomainFromHost("DEMO.Inventar.Test")).toBe("demo");
  });

  it("основният домейн и www са порталът", () => {
    expect(subdomainFromHost("inventar.test")).toBeNull();
    expect(subdomainFromHost("www.inventar.test")).toBeNull();
    expect(subdomainFromHost(null)).toBeNull();
  });

  it("чужди домейни и вложени поддомейни не са клиенти", () => {
    expect(subdomainFromHost("demo.other.test")).toBeNull();
    expect(subdomainFromHost("evilinventar.test")).toBeNull();
    expect(subdomainFromHost("a.b.inventar.test")).toBeNull();
    expect(subdomainFromHost("demo.inventar.test.evil.com")).toBeNull();
  });
});


describe("isValidSubdomain", () => {
  it.each(["demo", "a1", "my-shop", "x".repeat(63)])("валиден: %s", (s) => expect(isValidSubdomain(s)).toBe(true));
  it.each(["", "-a", "a-", "Demo", "a_b", "a.b", "x".repeat(64), "admin", "www", "api"])("невалиден: %s", (s) => expect(isValidSubdomain(s)).toBe(false));
});

it("tenantUrl", () => {
  expect(tenantUrl("demo", "/items")).toBe("https://demo.inventar.test/items");
});
