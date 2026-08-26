import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const brandMark = fs.readFileSync(path.join(root, "client/src/components/BrandMark.tsx"), "utf8");
const marketing = fs.readFileSync(path.join(root, "client/src/pages/MarketingPages.tsx"), "utf8");
const operations = fs.readFileSync(path.join(root, "client/src/components/operations/OperationsFrame.tsx"), "utf8");
const auth = fs.readFileSync(path.join(root, "client/src/components/public/PublicAuthSurface.tsx"), "utf8");
const onboarding = fs.readFileSync(path.join(root, "client/src/components/OrganizationOnboarding.tsx"), "utf8");
const documentShell = fs.readFileSync(path.join(root, "client/index.html"), "utf8");

describe("approved VahanSync maintenance-readiness branding", () => {
  it("uses the approved public Supabase Storage logo asset", () => {
    expect(brandMark).toContain("vahansync-brand/v1/vahansync-maintenance-readiness-vs.png");
    expect(brandMark).toContain("VahanSync maintenance readiness mark");
  });

  it("uses the same shared mark on public, authentication, onboarding, and role-workspace surfaces", () => {
    expect(marketing).toContain("BrandMark");
    expect(auth).toContain("BrandMark");
    expect(onboarding).toContain("BrandMark");
    expect(operations).toContain("BrandMark");
  });

  it("sets the approved mark as browser icon metadata", () => {
    expect(documentShell).toContain("vahansync-maintenance-readiness-vs.png");
    expect(documentShell).toContain('rel="icon"');
    expect(documentShell).toContain('name="theme-color" content="#111827"');
  });
});
