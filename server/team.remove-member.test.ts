import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), delete: vi.fn() },
  auditEvent: { create: vi.fn() },
  authDeleteUser: vi.fn(),
}));

vi.mock("./db", () => ({ fleetDb: mocks }));
vi.mock("./supabase", () => ({ supabaseAdmin: { auth: { admin: { deleteUser: mocks.authDeleteUser } } } }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const baseContext = {
  user: null,
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  fleetopsUser: {
    id: "00000000-0000-4000-8000-000000000001",
    authUserId: "00000000-0000-4000-8000-000000000011",
    orgId: "00000000-0000-4000-8000-000000000002",
    role: "SUPERADMIN",
    org: { id: "00000000-0000-4000-8000-000000000002", name: "Fleet", subscriptionTier: "TRIAL_FREE", trialEndsAt: new Date(Date.now() + 86400000), maxVehicles: 3, maxUsers: 10 },
  },
} as TrpcContext;

describe("team.removeMember", () => {
  beforeEach(() => vi.clearAllMocks());
  it("deletes the tenant member from Supabase Auth and FleetOps membership", async () => {
    const member = { id: "00000000-0000-4000-8000-000000000003", authUserId: "00000000-0000-4000-8000-000000000013", orgId: baseContext.fleetopsUser!.orgId, role: "FLEET_MANAGER", email: "manager@example.com", fullName: "Fleet Manager" };
    mocks.user.findFirst.mockResolvedValue(member);
    mocks.user.delete.mockResolvedValue(member);
    mocks.authDeleteUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.auditEvent.create.mockResolvedValue({ id: "audit-1" });

    await expect(appRouter.createCaller(baseContext).team.removeMember({ userId: member.id })).resolves.toEqual({ id: member.id, email: member.email, role: member.role });
    expect(mocks.authDeleteUser).toHaveBeenCalledWith(member.authUserId);
    expect(mocks.user.delete).toHaveBeenCalledWith({ where: { id: member.id } });
  });

  it("blocks self-removal and removal of another organization owner", async () => {
    await expect(appRouter.createCaller(baseContext).team.removeMember({ userId: baseContext.fleetopsUser!.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.user.findFirst.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000004", authUserId: "00000000-0000-4000-8000-000000000014", orgId: baseContext.fleetopsUser!.orgId, role: "SUPERADMIN", email: "owner2@example.com", fullName: "Second Owner" });
    await expect(appRouter.createCaller(baseContext).team.removeMember({ userId: "00000000-0000-4000-8000-000000000004" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.authDeleteUser).not.toHaveBeenCalled();
  });

  it("does not remove a member outside the current organization or for a specialist role", async () => {
    mocks.user.findFirst.mockResolvedValue(null);
    await expect(appRouter.createCaller(baseContext).team.removeMember({ userId: "00000000-0000-4000-8000-000000000005" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const fleetManagerContext = { ...baseContext, fleetopsUser: { ...baseContext.fleetopsUser!, role: "FLEET_MANAGER" } } as TrpcContext;
    await expect(appRouter.createCaller(fleetManagerContext).team.removeMember({ userId: "00000000-0000-4000-8000-000000000003" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
