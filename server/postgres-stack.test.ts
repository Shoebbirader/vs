import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const drizzleConfig = readFileSync(resolve(root, "drizzle.config.ts"), "utf8");
const runtimeDb = readFileSync(resolve(root, "server/db.ts"), "utf8");
const compatibilitySchema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const vercelManifest = readFileSync(resolve(root, "vercel.json"), "utf8");

describe("FleetOps production architecture", () => {
  it("uses Supabase PostgreSQL and Drizzle in the active runtime", () => {
    const directDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    expect(directDependencies).not.toHaveProperty("mysql2");
    expect(directDependencies).not.toHaveProperty("@prisma/client");
    expect(drizzleConfig).toContain('dialect: "postgresql"');
    expect(drizzleConfig).toContain("SUPABASE_DATABASE_URL");
    expect(runtimeDb).toContain('new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL');
    expect(compatibilitySchema).toContain('export * from "./fleetops-schema"');
  });

  it("publishes the tracked Vercel API function and routes tRPC requests to it", () => {
    expect(vercelManifest).toContain('"destination": "/api/index"');
    expect(vercelManifest).toContain('"source": "/api/trpc/:path*"');
    expect(existsSync(resolve(root, "api/index.js"))).toBe(true);
  });
});
