import { describe, expect, it } from "vitest";
import { subscriptionState } from "@/lib/plans";

const now = Date.parse("2026-10-21T12:00:00Z");
const day = 86_400_000;

describe("състояние на абонамента", () => {
  it("пробен период: пълен достъп, предупреждение 3 дни преди края, после само преглед", () => {
    expect(subscriptionState({ subscriptionStatus: "trial", trialEndsAt: new Date(now + 10 * day), paidUntil: null }, now)).toMatchObject({ readOnly: false, trialDaysLeft: 10, warning: null });
    expect(subscriptionState({ subscriptionStatus: "trial", trialEndsAt: new Date(now + 2 * day), paidUntil: null }, now).warning).toContain("2 дни");
    expect(subscriptionState({ subscriptionStatus: "trial", trialEndsAt: new Date(now - day), paidUntil: null }, now).readOnly).toBe(true);
  });

  it("активен: след „платено до“ — 7 дни гратисен период, после само преглед; прекратен — само преглед", () => {
    expect(subscriptionState({ subscriptionStatus: "active", trialEndsAt: null, paidUntil: null }, now).readOnly).toBe(false);
    const grace = subscriptionState({ subscriptionStatus: "active", trialEndsAt: null, paidUntil: new Date(now - 3 * day) }, now);
    expect(grace).toMatchObject({ readOnly: false });
    expect(grace.warning).toContain("4 дни");
    expect(subscriptionState({ subscriptionStatus: "past_due", trialEndsAt: null, paidUntil: new Date(now - 8 * day) }, now).readOnly).toBe(true);
    expect(subscriptionState({ subscriptionStatus: "cancelled", trialEndsAt: null, paidUntil: null }, now).readOnly).toBe(true);
  });
});
