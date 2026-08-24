import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { count: vi.fn() },
  invitation: { create: vi.fn(), findFirst: vi.fn() },
  organization: { findFirst: vi.fn() },
  vehicleAssignment: { findFirst: vi.fn() },
  vehicle: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  workOrder: { create: vi.fn() },
  inventoryPart: { findMany: vi.fn() },
}));

vi.mock("./db", () => ({ fleetDb: mocks }));
vi.mock("./supabase", () => ({ supabaseAdmin: { auth: { admin: { generateLink: vi.fn().mockResolvedValue({ data: { properties: { action_link: "https://auth.example/invite" } }, error: null }), inviteUserByEmail: vi.fn().mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null }) } } } }));
vi.mock("./invitation-email", () => ({ sendInvitationEmail: vi.fn().mockResolvedValue({ id: "email-test" }) }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const baseContext = {
  user: null,
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  fleetopsUser: {
    id: "00000000-0000-4000-8000-000000000001",
    orgId: "00000000-0000-4000-8000-000000000002",
    role: "SUPERADMIN",
    org: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Fleet",
      subscriptionTier: "TRIAL_FREE",
      trialEndsAt: new Date(Date.now() + 86400000),
      maxVehicles: 3,
      maxUsers: 10,
    },
  },
} as TrpcContext;

describe("RBAC and invitation procedures", () => {
  it("allows only the Superadmin to create invitations", async () => {
    const fleetManagerContext = {
      ...baseContext,
      fleetopsUser: { ...baseContext.fleetopsUser!, role: "FLEET_MANAGER" },
    } as TrpcContext;
    await expect(appRouter.createCaller(fleetManagerContext).team.invite({ email: "driver@example.com", role: "DRIVER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.invitation.create).not.toHaveBeenCalled();
  });

  it("returns only the invitation-bound email, role, and organization", async () => {
    mocks.invitation.findFirst.mockResolvedValue({ orgId: baseContext.fleetopsUser!.orgId, email: "driver@example.com", role: "DRIVER", expiresAt: new Date(Date.now() + 86400000) });
    mocks.organization.findFirst.mockResolvedValue({ id: baseContext.fleetopsUser!.orgId, name: "Avani Transit" });
    await expect(appRouter.createCaller(baseContext).onboarding.inviteDetails({ token: "00000000-0000-4000-8000-000000000003" })).resolves.toMatchObject({ email: "driver@example.com", role: "DRIVER", organization: { id: baseContext.fleetopsUser!.orgId, name: "Avani Transit" } });
  });

  it("denies a Driver inspection for a vehicle that is not assigned", async () => {
    mocks.vehicleAssignment.findFirst.mockResolvedValue(null);
    const driverContext = { ...baseContext, fleetopsUser: { ...baseContext.fleetopsUser!, role: "DRIVER" } } as TrpcContext;
    await expect(appRouter.createCaller(driverContext).driver.createInspection({ vehicleId: "00000000-0000-4000-8000-000000000003", inspectionType: "PRE_TRIP", status: "PASS" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies an Accountant from inventory pricing data", async () => {
    const accountantContext = { ...baseContext, fleetopsUser: { ...baseContext.fleetopsUser!, role: "ACCOUNTANT" } } as TrpcContext;
    await expect(appRouter.createCaller(accountantContext).inventory.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("supplies a live-schema status when Fleet Manager creates a vehicle", async () => {
    mocks.user.count.mockResolvedValue(1);
    mocks.vehicle.count.mockResolvedValue(0);
    mocks.vehicle.findMany.mockResolvedValue([]);
    mocks.vehicle.create.mockResolvedValue({ id: "vehicle-1", status: "ACTIVE" });
    const fleetManagerContext = { ...baseContext, fleetopsUser: { ...baseContext.fleetopsUser!, role: "FLEET_MANAGER" } } as TrpcContext;
    await appRouter.createCaller(fleetManagerContext).vehicles.create({ vin: "E2E12345VIN", licensePlate: "E2E-123", make: "Tata", model: "Prima", year: 2024, currentOdometer: 1000 });
    expect(mocks.vehicle.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "ACTIVE", orgId: baseContext.fleetopsUser!.orgId }) });
  });

  it("supplies live-schema fields when Fleet Manager creates a work order", async () => {
    mocks.vehicle.findFirst.mockResolvedValue({ id: "vehicle-1", orgId: baseContext.fleetopsUser!.orgId });
    mocks.workOrder.create.mockResolvedValue({ id: "work-order-1", status: "OPEN" });
    const fleetManagerContext = { ...baseContext, fleetopsUser: { ...baseContext.fleetopsUser!, role: "FLEET_MANAGER" } } as TrpcContext;
    await appRouter.createCaller(fleetManagerContext).workOrders.create({ vehicleId: "00000000-0000-4000-8000-000000000003", title: "E2E service", description: "Test", priority: "MEDIUM" as any });
    expect(mocks.workOrder.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: expect.any(String), status: "OPEN", createdAt: expect.any(Date), orgId: baseContext.fleetopsUser!.orgId }) });
  });

  it("returns a persisted manual-token invitation with explicit audit fields", async () => {
    mocks.user.count.mockResolvedValue(1);
    mocks.invitation.findFirst.mockResolvedValue(null);
    mocks.invitation.create.mockResolvedValue({ id: "inv-1", email: "driver@example.com", role: "DRIVER", tokenHash: "token-1" });
    const result = await appRouter.createCaller(baseContext).team.invite({ email: "driver@example.com", role: "DRIVER" });
    expect(result).toMatchObject({ id: "inv-1", delivery: "EMAIL", joinUrl: expect.stringContaining("/join/") });
    expect(mocks.invitation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: expect.any(String), createdAt: expect.any(Date), tokenHash: expect.any(String) }) });
  });
});
