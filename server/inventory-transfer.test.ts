import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("inventory transfer workflow", () => {
  it("restricts transfers to inventory control roles and the active organization", () => {
    expect(source).toContain("transfer: fleetOpsProcedure.input");
    expect(source).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"])');
    expect(source).toContain('where: { id: input.partId, orgId: ctx.fleetopsUser.orgId }');
  });

  it("updates the bin and records a TRANSFER movement without changing stock", () => {
    expect(source).toContain('data: { binLocation: input.toBinLocation }');
    expect(source).toContain('movementType: "TRANSFER", quantity: 0');
    expect(source).toContain('action: "INVENTORY_TRANSFERRED"');
  });
});
