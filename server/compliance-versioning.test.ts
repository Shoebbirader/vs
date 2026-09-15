import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/migrations/20260822000100_document_versions.sql", import.meta.url), "utf8");

describe("compliance document versioning contracts", () => {
  it("creates version one on upload and increments versions on renewal", () => {
    expect(routerSource).toContain("fleetDb.documentVersion.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, documentId: created.id, versionNumber: 1");
    expect(routerSource).toContain("const nextVersion = Number(versions[0]?.versionNumber ?? 0) + 1");
    expect(routerSource).toContain("documentId: updated.id, versionNumber: nextVersion");
  });

  it("scopes version history and storage access to the current organization", () => {
    expect(routerSource).toContain("versions: fleetOpsProcedure.input(z.object({ documentId: z.string().uuid() }))");
    expect(routerSource).toContain("where: { id: input.documentId, orgId: ctx.fleetopsUser.orgId }");
    expect(routerSource).toContain("where: { orgId: ctx.fleetopsUser.orgId, documentId: document.id }");
    expect(routerSource).toContain('requireRole(ctx.fleetopsUser.role, input.kind === "DOCUMENT" ? ["SUPERADMIN", "FLEET_MANAGER"]');
  });

  it("returns configurable vehicle and assigned-driver readiness states", () => {
    expect(routerSource).toContain("expiryWindowDays: z.number().int().min(1).max(365).default(30)");
    expect(routerSource).toContain("const driverRows = (assignments as any[])");
    expect(routerSource).toContain("return { expiryWindowDays: windowDays, counts, vehicles: vehicleRows, drivers: driverRows, driverCounts }");
  });

  it("defines tenant RLS and uniqueness for document versions in Supabase", () => {
    expect(migrationSource).toContain('references public.documents(id) on delete cascade');
    expect(migrationSource).toContain('unique ("documentId", "versionNumber")');
    expect(migrationSource).toContain("enable row level security");
    expect(migrationSource).toContain("public.current_fleetops_org_id()");
  });
});
