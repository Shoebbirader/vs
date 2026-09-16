import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const drizzleConfig = readFileSync(resolve(root, "drizzle.config.ts"), "utf8");
const runtimeDb = readFileSync(resolve(root, "server/db.ts"), "utf8");
const compatibilitySchema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const vercelManifest = readFileSync(resolve(root, "vercel.json"), "utf8");
const pythonEntrypoint = readFileSync(resolve(root, "api/python.py"), "utf8");
const pythonBackend = readFileSync(resolve(root, "backend/app/main.py"), "utf8");

describe("VahanSync production architecture", () => {
  it("uses Supabase PostgreSQL and Drizzle in the active runtime", () => {
    const directDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    expect(directDependencies).not.toHaveProperty("mysql2");
    expect(directDependencies).not.toHaveProperty("@prisma/client");
    expect(drizzleConfig).toContain('dialect: "postgresql"');
    expect(drizzleConfig).toContain("SUPABASE_DATABASE_URL");
    expect(runtimeDb).toContain('new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL');
    expect(compatibilitySchema).toContain('export * from "./fleetops-schema"');
  });

  it("publishes the Python API function and routes frontend traffic to it", () => {
    expect(vercelManifest).toContain('"dest": "/api/python.py"');
    expect(vercelManifest).toContain('"^/api/trpc(?:/.*)?$"');
    expect(vercelManifest).toContain('"^/api/v2(?:/.*)?$"');
    expect(pythonEntrypoint).toContain("from app.main import app");
    expect(pythonBackend).toContain("application.include_router(compatibility_router)");
    expect(existsSync(resolve(root, "api/python.py"))).toBe(true);
  });
});
