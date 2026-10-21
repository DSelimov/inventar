import { describe, expect, it } from "vitest";
import { validEan } from "@/lib/pdf";

describe("validEan (избор между EAN и Code 128 за етикетите)", () => {
  it.each(["3800100000019", "4006381333931", "96385074"])("валиден EAN: %s", (c) => expect(validEan(c)).toBe(true));
  it.each(["3800100000011", "12345", "OB-TEE-CHER", "380010000001A", "963850745"])("не е EAN: %s", (c) => expect(validEan(c)).toBe(false));
});
