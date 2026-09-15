import { describe, expect, it } from "vitest";
import { FLEET_ROLES, ROLE_POLICIES, roleCanAct, tenantScope } from "./role-policy";

describe("centralized FleetOps role policy", () => {
  it("defines all seven operational roles", () => {
    expect(FLEET_ROLES).toHaveLength(7);
    expect(FLEET_ROLES).toContain("SUPERADMIN");
    expect(FLEET_ROLES).toContain("ACCOUNTANT");
  });

  it("keeps role boundaries explicit", () => {
    expect(roleCanAct("ACCOUNTANT", ROLE_POLICIES.finance)).toBe(true);
    expect(roleCanAct("DRIVER", ROLE_POLICIES.finance)).toBe(false);
    expect(roleCanAct("INVENTORY_MANAGER", ROLE_POLICIES.inventoryControl)).toBe(true);
  });

  it("returns a reusable tenant scope", () => {
    expect(tenantScope("org-1")).toEqual({ orgId: "org-1" });
  });
});
