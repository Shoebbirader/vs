import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notification: { findFirst: vi.fn(), updateMany: vi.fn() },
  vehicleIssue: { findFirst: vi.fn() },
  workOrder: { findFirst: vi.fn() },
  vehicle: { findFirst: vi.fn() },
  auditEvent: { create: vi.fn() },
}));

vi.mock("./db", () => ({ fleetDb: mocks }));
vi.mock("./supabase", () => ({
  supabaseAdmin: { auth: { admin: {} }, storage: {} },
  getSupabaseAuthIdentity: vi.fn(),
  provisionFleetOpsUser: vi.fn(),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = {
  user: null,
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  fleetopsUser: {
    id: "00000000-0000-4000-8000-000000000001",
    orgId: "00000000-0000-4000-8000-000000000002",
    role: "SUPERADMIN",
    fullName: "Ops Lead",
    org: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Fleet",
      subscriptionTier: "TRIAL_FREE",
      trialEndsAt: new Date(Date.now() + 86_400_000),
      maxVehicles: 3,
      maxUsers: 5,
      billingStatus: "TRIAL",
    },
  },
} as TrpcContext;

describe("notification resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not resolve if the source work order remains open", async () => {
    mocks.notification.findFirst.mockResolvedValue({
      id: "notification-1",
      orgId: context.fleetopsUser!.orgId,
      title: "Work order reminder",
      sourceType: "WORK_ORDER",
      referenceId: "work-order-1",
      resolvedAt: null,
      acknowledgedAt: null,
    });
    mocks.workOrder.findFirst.mockResolvedValue({
      id: "work-order-1",
      orgId: context.fleetopsUser!.orgId,
      status: "OPEN",
    });

    await expect(
      appRouter.createCaller(context).notifications.resolve({
        id: "notification-1",
        note: "done",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
