import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  component: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  vehicle: { findFirst: vi.fn() },
}));

vi.mock("./db", () => ({ fleetDb: mocks }));
const evaluateVehicleMaintenance = vi.hoisted(() => vi.fn().mockResolvedValue({ createdWorkOrders: 1 }));
vi.mock("./automation", () => ({ evaluateVehicleMaintenance }));

const component = mocks.component;
const vehicle = mocks.vehicle;

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"], fleetopsUser: { id: "u1", orgId: "org-a", role: "MECHANIC", org: { id: "org-a", name: "A", subscriptionTier: "TRIAL_FREE", trialEndsAt: new Date(Date.now() + 86400000), maxVehicles: 3, maxUsers: 3 } } } as TrpcContext;

describe("component procedures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes list queries through the authenticated organization", async () => {
    component.findMany.mockResolvedValue([]);
    await appRouter.createCaller(ctx).components.list({});
    expect(component.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ vehicle: { orgId: "org-a" } }) }));
  });

  it("creates only after validating the vehicle belongs to the tenant", async () => {
    vehicle.findFirst.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
    component.create.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002" });
    const result = await appRouter.createCaller(ctx).components.create({ vehicleId: "00000000-0000-4000-8000-000000000001", name: "Brake pad", expectedLifeKm: 50000, lastServicedOdometer: 1000, alertThresholdKm: 5000 });
    expect(result).toEqual({ id: "00000000-0000-4000-8000-000000000002" });
    expect(vehicle.findFirst).toHaveBeenCalledWith({ where: { id: "00000000-0000-4000-8000-000000000001", orgId: "org-a" } });
    expect(evaluateVehicleMaintenance).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", "org-a");
  });

  it("blocks a driver from updating a component", async () => {
    const driverCtx = { ...ctx, fleetopsUser: { ...ctx.fleetopsUser!, role: "DRIVER" } } as TrpcContext;
    await expect(appRouter.createCaller(driverCtx).components.update({ id: "00000000-0000-4000-8000-000000000002", name: "Brake pad" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects update and delete access to a component outside the tenant", async () => {
    const adminCtx = { ...ctx, fleetopsUser: { ...ctx.fleetopsUser!, role: "SUPERADMIN" } } as TrpcContext;
    component.findFirst.mockResolvedValue(null);
    await expect(appRouter.createCaller(adminCtx).components.update({ id: "00000000-0000-4000-8000-000000000002", name: "Brake pad" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(appRouter.createCaller(adminCtx).components.remove({ id: "00000000-0000-4000-8000-000000000002" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(component.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ vehicle: { orgId: "org-a" } }) }));
  });

  it("deletes a component only after tenant-scoped lookup", async () => {
    const adminCtx = { ...ctx, fleetopsUser: { ...ctx.fleetopsUser!, role: "SUPERADMIN" } } as TrpcContext;
    component.findFirst.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002" });
    component.delete.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002" });
    await appRouter.createCaller(adminCtx).components.remove({ id: "00000000-0000-4000-8000-000000000002" });
    expect(component.delete).toHaveBeenCalledWith({ where: { id: "00000000-0000-4000-8000-000000000002" } });
  });
});
