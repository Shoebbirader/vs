import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workOrder: { findMany: vi.fn() } }));
vi.mock("./db", () => ({ fleetDb: mocks }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = (role: string): TrpcContext => ({
  user: null,
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  fleetopsUser: {
    id: "00000000-0000-4000-8000-000000000001",
    orgId: "00000000-0000-4000-8000-000000000002",
    role,
    org: { id: "00000000-0000-4000-8000-000000000002", name: "Fleet", subscriptionTier: "TRIAL_FREE", trialEndsAt: new Date(Date.now() + 86_400_000), maxVehicles: 100, maxUsers: 20, currency: "INR" },
  },
} as TrpcContext);

describe("maintenance performance report", () => {
  it("returns turnaround, downtime, repeat-repair, and vehicle metrics", async () => {
    const createdAt = new Date("2026-08-01T00:00:00.000Z");
    mocks.workOrder.findMany.mockResolvedValue([
      { id: "one", title: "Brake service", vehicleId: "vehicle-1", status: "COMPLETED", createdAt, startedAt: new Date("2026-08-01T01:00:00.000Z"), completedAt: new Date("2026-08-01T03:00:00.000Z"), vehicle: { licensePlate: "KA-01" } },
      { id: "two", title: "Brake service", vehicleId: "vehicle-1", status: "OPEN", createdAt, vehicle: { licensePlate: "KA-01" } },
    ]);
    const result = await appRouter.createCaller(context("FLEET_MANAGER")).reports.maintenancePerformance({ from: new Date("2026-08-01"), to: new Date("2026-08-31") });
    expect(result.completedWorkOrders).toBe(1);
    expect(result.repeatRepairs).toEqual([{ title: "Brake service", count: 2 }]);
    expect(result.vehicleRepairCounts).toEqual([{ vehicleId: "vehicle-1", vehicle: "Reg KA-01", repairs: 1 }]);
    expect(result.turnaroundHours).toBe(2);
  });

  it("denies operational roles outside reporting scope", async () => {
    await expect(appRouter.createCaller(context("DRIVER")).reports.maintenancePerformance()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
