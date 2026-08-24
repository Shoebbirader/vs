import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Fleet Manager component inventory-reference contract", () => {
  it("exposes only a tenant-scoped part reference list for lifecycle linkage", () => {
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const workspace = readFileSync(resolve(process.cwd(), "client/src/components/workspaces/ComponentLifecycleWorkspace.tsx"), "utf8");
    expect(router).toContain('references: fleetOpsProcedure.query(({ ctx }) => { requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN"])');
    expect(router).toContain('select: { id: true, sku: true, name: true }');
    expect(workspace).toContain("trpc.inventory.references.useQuery");
    expect(workspace).not.toContain("trpc.inventory.list.useQuery");
  });
});
