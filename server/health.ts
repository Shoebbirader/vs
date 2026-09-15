import { sql } from "drizzle-orm";
import { db } from "./db";

export const RELEASE =
  process.env.RELEASE_VERSION ?? "fleetops-observability-20260820";

type ReadinessResult = {
  ok: boolean;
  release: string;
  service: string;
  environment: string;
  database: "ok" | "degraded";
  configuration: "ok" | "degraded";
  checkedAt: string;
};

function configurationReady() {
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY) &&
      process.env.SUPABASE_DATABASE_URL
  );
}

export async function getReadiness(): Promise<ReadinessResult> {
  let database: ReadinessResult["database"] = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "degraded";
  }
  const configuration: ReadinessResult["configuration"] = configurationReady()
    ? "ok"
    : "degraded";
  return {
    ok: database === "ok" && configuration === "ok",
    release: RELEASE,
    service: "FleetOps API",
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    database,
    configuration,
    checkedAt: new Date().toISOString(),
  };
}
