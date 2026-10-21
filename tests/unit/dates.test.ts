import { describe, expect, it } from "vitest";
import { endOfLocalDay, startOfLocalDay } from "@/lib/dates";

describe("местни дни (Europe/Sofia)", () => {
  it("зимно (+2) и лятно (+3) време, смяната на часа", () => {
    expect(startOfLocalDay("2026-01-15").toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(startOfLocalDay("2026-07-15").toISOString()).toBe("2026-07-14T21:00:00.000Z");
    expect(endOfLocalDay("2026-03-28").toISOString()).toBe("2026-03-28T22:00:00.000Z"); // 29 март: преминаване към лятно
    expect(startOfLocalDay("2026-03-30").toISOString()).toBe("2026-03-29T21:00:00.000Z");
    expect(endOfLocalDay("2026-10-24").toISOString()).toBe("2026-10-24T21:00:00.000Z"); // 25 октомври: обратно към зимно
    expect(startOfLocalDay("2026-10-26").toISOString()).toBe("2026-10-25T22:00:00.000Z");
  });
});
