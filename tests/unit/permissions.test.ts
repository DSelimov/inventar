import { describe, expect, it } from "vitest";
import { ROLES } from "@/db/control-schema";
import { can, LEVELS } from "@/lib/permissions";

const expected = {
  viewer: ["read"],
  staff: ["read", "write"],
  manager: ["read", "write", "delete"],
  admin: ["read", "write", "delete", "manage"],
  owner: ["read", "write", "delete", "manage", "owner"],
} as const;

describe("can", () => {
  for (const role of ROLES) {
    it(`${role}: ${expected[role].join(", ")}`, () => {
      for (const level of LEVELS) expect(can(role, level)).toBe((expected[role] as readonly string[]).includes(level));
    });
  }
});
