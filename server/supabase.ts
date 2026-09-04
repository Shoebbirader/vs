import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { fleetDb } from "./db";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const authSupabaseUrl = supabaseUrl ?? process.env.VITE_SUPABASE_URL;
const authAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? serviceRoleKey;
const authIssuer = authSupabaseUrl ? `${authSupabaseUrl.replace(/\/$/, "")}/auth/v1` : null;
const supabaseJwks = new Map<string, any>();

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

function getCandidateSupabaseIssuer(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { iss?: unknown };
    if (typeof payload.iss !== "string") return null;
    const url = new URL(payload.iss);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || url.pathname !== "/auth/v1" || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export async function getSupabaseAuthIdentity(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    console.warn("[Supabase] No bearer token on protected request", { path: req?.path ?? req?.url ?? "unknown" });
    return null;
  }
  const tokenIssuer = getCandidateSupabaseIssuer(token) ?? authIssuer;
  if (tokenIssuer) {
    try {
      const { createRemoteJWKSet, jwtVerify } = await import("jose");
      const jwks = supabaseJwks.get(tokenIssuer) ?? createRemoteJWKSet(new URL(`${tokenIssuer}/.well-known/jwks.json`));
      supabaseJwks.set(tokenIssuer, jwks);
      const { payload } = await jwtVerify(token, jwks, { issuer: tokenIssuer, audience: "authenticated", algorithms: ["ES256"] });
      if (typeof payload.sub === "string" && payload.sub.length > 0) {
        const userMetadata = payload.user_metadata && typeof payload.user_metadata === "object" && !Array.isArray(payload.user_metadata)
          ? payload.user_metadata as Record<string, unknown>
          : {};
        return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : null, user_metadata: userMetadata };
      }
    } catch (error) {
      console.warn("[Supabase] Public-key bearer verification failed", { path: req?.path ?? req?.url ?? "unknown", reason: error instanceof Error ? error.message : "verification_failed" });
    }
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

  const user = await fleetDb.user.findUnique({ where: { authUserId: authUser.id } })
    ?? (authUser.email ? await fleetDb.user.findFirst({ where: { email: authUser.email } }) : null);
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
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        maxVehicles: 3,
        maxUsers: 999999,
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
