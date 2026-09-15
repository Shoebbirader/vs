import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  vehicle: { findMany: vi.fn() },
  workOrder: { count: vi.fn() },
  inventoryPart: { count: vi.fn() },
  notification: { count: vi.fn() },
  financialRecord: { aggregate: vi.fn() },
}));

vi.mock("./db", () => ({ fleetDb: mocks }));
vi.mock("./supabase", () => ({
  getSupabaseAuthIdentity: vi.fn().mockResolvedValue({ user_metadata: { needsOnboarding: false } }),
  supabaseAdmin: { auth: { admin: {} } },
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const org = { id: "00000000-0000-4000-8000-000000000001", name: "Avani Transit", subscriptionTier: "TRIAL_FREE", trialEndsAt: new Date(Date.now() + 86400000), maxVehicles: 3, maxUsers: 5 };
const context = { req: { headers: {}, cookies: {} }, res: {}, user: null, fleetopsUser: { id: "00000000-0000-4000-8000-000000000002", authUserId: "auth-1", orgId: org.id, email: "owner@example.com", fullName: "Owner", name: "Owner", role: "SUPERADMIN", org } } as unknown as TrpcContext;

describe("dashboard.summary", () => {
  it("returns organization-scoped summary data without relation hydration errors", async () => {
    mocks.vehicle.findMany.mockResolvedValue([]);
    mocks.workOrder.count.mockResolvedValue(0);
    mocks.inventoryPart.count.mockResolvedValue(0);
    mocks.notification.count.mockResolvedValue(0);
    mocks.financialRecord.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    const result = await appRouter.createCaller(context).dashboard.summary();

    expect(result).toMatchObject({ org: { id: org.id, name: org.name }, role: "SUPERADMIN", needsOnboarding: false, vehicles: [], openWorkOrders: 0, inventoryAlerts: 0, unreadNotifications: 0, monthlyExpense: 0 });
  });
});
