import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
type LegacyUser = { id: number; openId: string; name: string | null; email: string | null; loginMethod: string | null; role: "user" | "admin"; createdAt: Date; updatedAt: Date; lastSignedIn: Date };
type FleetOpsUser = { id: string; authUserId: string; orgId: string; email: string; fullName: string; role: string; name: string; org: { id: string; name: string; subscriptionTier: string; trialEndsAt: Date; maxVehicles: number; maxUsers: number } };
import { getFleetOpsUserFromRequest } from "../supabase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: LegacyUser | null;
  fleetopsUser: (FleetOpsUser & { name: string; org: { id: string; name: string; subscriptionTier: string; trialEndsAt: Date; maxVehicles: number; maxUsers: number } }) | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: LegacyUser | null = null;
  let fleetopsUser: TrpcContext["fleetopsUser"] = null;

  try {
    fleetopsUser = await getFleetOpsUserFromRequest(opts.req);
  } catch (error) {
    console.warn("[Supabase] Failed to resolve FleetOps user", error);
  }

  return { req: opts.req, res: opts.res, user, fleetopsUser };
}
