import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const roleWorkspaces = readFileSync("client/src/components/RoleWorkspaces.tsx", "utf8");
const functionalWorkspace = readFileSync("client/src/components/FunctionalWorkspace.tsx", "utf8");
const home = readFileSync("client/src/pages/Home.tsx", "utf8");
const marketing = readFileSync("client/src/pages/MarketingPages.tsx", "utf8");
const team = readFileSync("client/src/components/workspaces/TeamWorkspace.tsx", "utf8");
const driver = readFileSync("client/src/components/workspaces/DriverWorkspace.tsx", "utf8");
const accountant = readFileSync("client/src/components/workspaces/AccountantWorkspace.tsx", "utf8");
const styles = readFileSync("client/src/index.css", "utf8");

describe("VahanSync 2026 workspace UI contract", () => {
  it("gives every role a distinct header and surface class", () => {
    expect(roleWorkspaces).toContain("role-${role.toLowerCase()}");
    for (const surface of ["role-superadmin-surface", "role-fleet-manager-surface", "role-inventory-manager-surface", "role-${role.toLowerCase()}-surface", "role-driver-surface", "role-accountant-surface"]) {
      expect(roleWorkspaces).toContain(surface);
    }
    expect(roleWorkspaces).toContain("workspace-kpi-top");
    expect(roleWorkspaces).toContain("workspace-kpi-pulse");
  });

  it("creates a stable section class for every authenticated functional page", () => {
    expect(functionalWorkspace).toContain("sectionClass = section.toLowerCase().replace");
    for (const section of ["Vehicles", "Components", "Work orders", "Team"]) {
      expect(functionalWorkspace).toContain(`section === \"${section}\"`);
    }
    for (const snippet of ["Inventory:", "Vendors:", "\"Purchase orders\":", "Notifications:", "\"P&L analytics\":", "Billing:"]) {
      expect(functionalWorkspace).toContain(snippet);
    }
  });

  it("defines modern page-specific surfaces and accessible motion behavior", () => {
    for (const selector of [".workspace-page-header", ".workspace-kpi-top", ".workspace-kpi-pulse", ".functional-workspace.vehicles", ".functional-workspace.work-orders", ".functional-workspace.inventory", ".functional-workspace.billing", "prefers-reduced-motion", ".marketing-footer", ".workspace-nav", ".nav-group", ".brand-mark-route", ".workspace-header-foot", ".role-journey"]) {
      expect(styles).toContain(selector);
    }
  });

  it("keeps role-aware command surfaces and identity language singular", () => {
    expect(home).toContain("const navGroups");
    expect(home).toContain("roleDescriptor");
    expect(home).toContain("WorkspaceNav");
    expect(home).toContain("brand-mark-route");
    expect(marketing).toContain("brand-mark-route");
    expect(marketing).not.toContain("brand-mark-glyph");
  });

  it("gives governance, driver, and finance workspaces a first-class signal strip", () => {
    expect(team).toContain("governance-signal-grid");
    expect(team).toContain("activeRoles");
    expect(driver).toContain("driver-signal-strip");
    expect(driver).toContain("issueDraftStatus");
    expect(accountant).toContain("accountant-signal-strip");
    expect(accountant).toContain("mismatchCount");
    expect(styles).toContain(".governance-signal-grid");
    expect(styles).toContain(".driver-signal-strip");
    expect(styles).toContain(".accountant-signal-strip");
  });
});
