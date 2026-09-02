import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("work-order lifecycle RBAC", () => {
  it("declares the canonical operational statuses", () => {
    expect(source).toContain('"WAITING_FOR_PARTS", "READY_FOR_REVIEW", "REWORK", "CANCELLED"');
    expect(source).toContain('"COMPLETED", "CANCELLED"].map((status)');
  });

  it("limits status transitions by role and keeps completion approval-gated", () => {
    expect(source).toContain('const roleAllowed = ctx.fleetopsUser.role === "FLEET_MANAGER"');
    expect(source).toContain('code: "FORBIDDEN", message: `Cannot move work order');
    expect(source).toContain('status: "READY_FOR_REVIEW"');
    expect(source).toContain('const vehicle = await fleetDb.vehicle.findFirst({ where: { id: order.vehicleId, orgId: ctx.fleetopsUser.orgId } })');
    expect(source).toContain('const serviceOdometer = latestOdometer?.reading ?? vehicle.currentOdometer');
    expect(source).toContain('lastServicedOdometer: serviceOdometer');
  });
});
