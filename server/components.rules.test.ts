import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { requireRole } from "./routers";

describe("component permissions", () => {
  it("allows maintenance roles to manage components", () => {
    expect(() => requireRole("SUPERADMIN", ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC"])).not.toThrow();
    expect(() => requireRole("MECHANIC", ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC"])).not.toThrow();
  });

  it("blocks drivers from changing component records", () => {
    expect(() => requireRole("DRIVER", ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC"])).toThrowError(TRPCError);
  });
});
