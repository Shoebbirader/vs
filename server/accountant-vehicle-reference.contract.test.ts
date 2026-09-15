import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Accountant vehicle reference contract", () => {
  it("offers a VIN-aware financial vehicle reference query without relying on the operational vehicles list", () => {
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const workspace = readFileSync(resolve(process.cwd(), "client/src/components/workspaces/AccountantWorkspace.tsx"), "utf8");
    expect(router).toContain('vehicles: fleetOpsProcedure.query(async ({ ctx }) => { requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"])');
    expect(router).toContain('select: { id: true, vin: true, licensePlate: true, make: true, model: true, currentOdometer: true }');
    expect(workspace).toContain("trpc.financials.vehicles.useQuery");
    expect(workspace).not.toContain("trpc.vehicles.list.useQuery");
  });
});
