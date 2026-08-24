import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "supabase.ts"), "utf8");

describe("Supabase bearer-token verifier", () => {
  it("uses the public browser-aligned Supabase configuration for getUser", () => {
    expect(source).toContain("const authSupabaseUrl = supabaseUrl ?? process.env.VITE_SUPABASE_URL");
    expect(source).toContain("const authAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? serviceRoleKey");
    expect(source).toContain("export const supabaseAuth = createClient(");
    expect(source).toContain("supabaseAuth.auth.getUser(token)");
  });

  it("verifies the current ES256 bearer token against the project JWKS before relying on an API key", () => {
    expect(source).toContain('import { createRemoteJWKSet, jwtVerify } from "jose"');
    expect(source).toContain("createRemoteJWKSet(new URL(`${authIssuer}/.well-known/jwks.json`))");
    expect(source).toContain('jwtVerify(token, supabaseJwks, { issuer: authIssuer, audience: "authenticated", algorithms: ["ES256"] })');
  });

  it("keeps the service client reserved for privileged operations", () => {
    expect(source).toContain("export const supabaseAdmin = createClient(");
    expect(source).not.toContain("supabaseAdmin.auth.getUser(token)");
  });
});
