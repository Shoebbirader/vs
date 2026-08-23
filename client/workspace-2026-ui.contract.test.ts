import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const roleWorkspaces = readFileSync("client/src/components/RoleWorkspaces.tsx", "utf8");
const functionalWorkspace = readFileSync("client/src/components/FunctionalWorkspace.tsx", "utf8");
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
    for (const selector of [".workspace-page-header", ".workspace-kpi-top", ".workspace-kpi-pulse", ".functional-workspace.vehicles", ".functional-workspace.work-orders", ".functional-workspace.inventory", ".functional-workspace.billing", "prefers-reduced-motion", ".marketing-footer"]) {
      expect(styles).toContain(selector);
    }
  });
});
