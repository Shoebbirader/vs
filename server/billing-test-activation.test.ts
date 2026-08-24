import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ organization: { update: vi.fn() }, auditEvent: { create: vi.fn() } }));
vi.mock("./db", () => ({ fleetDb: mocks }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = (role = "SUPERADMIN") => ({ user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"], fleetopsUser: { id: "00000000-0000-4000-8000-000000000001", orgId: "00000000-0000-4000-8000-000000000002", role, org: { id: "00000000-0000-4000-8000-000000000002", name: "Workflow Lab", subscriptionTier: "TRIAL_FREE", trialEndsAt: new Date(Date.now() + 86_400_000), maxVehicles: 3, maxUsers: 3, billingStatus: "TRIAL" } } }) as TrpcContext;

describe("Razorpay test-mode Starter activation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.organization.update.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", subscriptionTier: "STARTER", maxVehicles: 10, maxUsers: 10 }); mocks.auditEvent.create.mockResolvedValue({ id: "audit" }); });
  it("upgrades only the current Superadmin tenant from trial to Starter capacity in test mode", async () => {
    const result = await appRouter.createCaller(context()).billingTest.activateStarter();
    expect(result).toMatchObject({ activated: true, tier: "STARTER", maxVehicles: 10, maxUsers: 10 });
    expect(mocks.organization.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "00000000-0000-4000-8000-000000000002" }, data: expect.objectContaining({ subscriptionTier: "STARTER", maxVehicles: 10, maxUsers: 10, billingStatus: "ACTIVE" }) }));
    expect(mocks.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "BILLING_TEST_PLAN_ACTIVATED", orgId: "00000000-0000-4000-8000-000000000002" }) }));
  });
  it("denies non-Superadmin activation attempts", async () => {
    await expect(appRouter.createCaller(context("FLEET_MANAGER")).billingTest.activateStarter()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
