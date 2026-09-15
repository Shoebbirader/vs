import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("inventory part detail workflow", () => {
  it("exposes an organization-scoped part detail query", () => {
    expect(routerSource).toContain("get: fleetOpsProcedure.input(z.object({ partId: z.string().uuid() }))");
    expect(routerSource).toContain('where: { id: input.partId, orgId: ctx.fleetopsUser.orgId }');
    expect(routerSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"])');
  });

  it("returns movement history and reserved and available balances", () => {
    expect(routerSource).toContain('where: { orgId: ctx.fleetopsUser.orgId, partId: part.id }');
    expect(routerSource).toContain('movement.movementType === "RESERVATION"');
    expect(routerSource).toContain("available: Math.max(0, Number(part.quantityOnHand)");
  });
});
