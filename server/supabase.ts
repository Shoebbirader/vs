import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { fleetDb } from "./db";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const authSupabaseUrl = process.env.VITE_SUPABASE_URL ?? supabaseUrl;
const authAnonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? serviceRoleKey;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
}

export const supabaseAdmin = createClient(
  supabaseUrl ?? "http://localhost:54321",
  serviceRoleKey ?? "development-placeholder",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Validating a bearer token is a public Auth operation. Keep it separate from
// privileged service operations so the Vercel request boundary remains aligned
// with the same Supabase project configuration used by the browser client.
export const supabaseAuth = createClient(
  authSupabaseUrl ?? "http://localhost:54321",
  authAnonKey ?? "development-placeholder",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function getBearerToken(req: Request): string | null {
  const header = req?.headers?.authorization ?? (typeof req?.get === "function" ? req.get("authorization") : undefined);
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) return header.slice("bearer ".length).trim();
  const cookieToken = req?.cookies?.["sb-access-token"] ?? req?.cookies?.["supabase-auth-token"];
  return typeof cookieToken === "string" ? cookieToken : null;
}

export async function getSupabaseAuthIdentity(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    console.warn("[Supabase] No bearer token on protected request", { path: req?.path ?? req?.url ?? "unknown" });
    return null;
  }
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    console.warn("[Supabase] Bearer token rejected", { path: req?.path ?? req?.url ?? "unknown", reason: error?.message ?? "user_not_found" });
    return null;
  }
  return data.user;
}

export async function getFleetOpsUserFromRequest(req: Request) {
  const authUser = await getSupabaseAuthIdentity(req);
  if (!authUser) return null;

  const user = await fleetDb.user.findUnique({ where: { authUserId: authUser.id } });
  if (!user) return null;
  const org = await fleetDb.organization.findFirst({ where: { id: user.orgId } });
  if (!org) return null;
  const normalizedOrg = {
    ...org,
    trialEndsAt: org.trialEndsAt instanceof Date ? org.trialEndsAt : new Date(String(org.trialEndsAt)),
    updatedAt: org.updatedAt instanceof Date ? org.updatedAt : new Date(String(org.updatedAt)),
  };
  return { ...user, org: normalizedOrg, name: user.fullName };
}

export async function provisionFleetOpsUser(input: {
  authUserId: string;
  email: string;
  fullName: string;
  orgName?: string;
  role?: "SUPERADMIN" | "FLEET_MANAGER" | "MECHANIC" | "TECHNICIAN" | "DRIVER" | "INVENTORY_MANAGER" | "ACCOUNTANT";
}) {
  const existing = await fleetDb.user.findUnique({ where: { authUserId: input.authUserId }, include: { org: true } });
  if (existing) return existing;

  const role = input.role ?? "SUPERADMIN";
  return fleetDb.$transaction(async (tx: any) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName ?? `${input.fullName}'s Fleet`,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        maxVehicles: 3,
        maxUsers: 5,
      },
    });

    return tx.user.create({
      data: {
        authUserId: input.authUserId,
        orgId: org.id,
        email: input.email,
        fullName: input.fullName,
        role,
      },
      include: { org: true },
    });
  });
}
