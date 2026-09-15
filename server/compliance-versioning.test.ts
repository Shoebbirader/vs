import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routerSource = readFileSync(
  new URL("./routers.ts", import.meta.url),
  "utf8"
);
const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20260822000100_document_versions.sql",
    import.meta.url
  ),
  "utf8"
);

describe("compliance document versioning contracts", () => {
  it("creates version one on upload and increments versions on renewal", () => {
    expect(routerSource).toMatch(
      /tx\.documentVersion\.create\(\{\s*data:\s*\{\s*id:\s*crypto\.randomUUID\(\),\s*orgId:\s*ctx\.fleetopsUser\.orgId,\s*documentId:\s*document\.id,\s*versionNumber:\s*1/
    );
    expect(routerSource).toMatch(
      /const nextVersion = Number\(versions\[0\]\?\.versionNumber \?\? 0\) \+ 1/
    );
    expect(routerSource).toMatch(
      /documentId:\s*document\.id,\s*versionNumber:\s*nextVersion/
    );
  });

  it("scopes version history and storage access to the current organization", () => {
    expect(routerSource).toMatch(
      /versions:\s*fleetOpsProcedure[\s\S]*documentId:\s*z\.string\(\)\.uuid\(\)/
    );
    expect(routerSource).toMatch(
      /where:\s*\{\s*id:\s*input\.documentId,\s*orgId:\s*ctx\.fleetopsUser\.orgId\s*\}/
    );
    expect(routerSource).toMatch(
      /where:\s*\{\s*orgId:\s*ctx\.fleetopsUser\.orgId,\s*documentId:\s*document\.id\s*\}/
    );
    expect(routerSource).toContain(
      'requireRole(\n          ctx.fleetopsUser.role,\n          input.kind === "DOCUMENT"'
    );
  });

  it("returns configurable vehicle and assigned-driver readiness states", () => {
    expect(routerSource).toContain(
      "expiryWindowDays: z.number().int().min(1).max(365).default(30)"
    );
    expect(routerSource).toContain("const driverRows = (assignments as any[])");
    expect(routerSource).toMatch(
      /return\s*\{\s*expiryWindowDays:\s*windowDays,\s*counts,\s*vehicles:\s*vehicleRows,\s*drivers:\s*driverRows,\s*driverCounts,?\s*\}/
    );
  });

  it("defines tenant RLS and uniqueness for document versions in Supabase", () => {
    expect(migrationSource).toContain(
      "references public.documents(id) on delete cascade"
    );
    expect(migrationSource).toContain('unique ("documentId", "versionNumber")');
    expect(migrationSource).toContain("enable row level security");
    expect(migrationSource).toContain("public.current_fleetops_org_id()");
  });
});
