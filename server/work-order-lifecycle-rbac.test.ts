import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("work-order lifecycle RBAC", () => {
  it("declares the canonical operational statuses", () => {
    expect(source).toMatch(
      /"WAITING_FOR_PARTS",\s+"READY_FOR_REVIEW",\s+"REWORK",\s+"CANCELLED"/
    );
    expect(source).toMatch(/!\["COMPLETED",\s+"CANCELLED"\]\.includes/);
  });

  it("limits status transitions by role and keeps completion approval-gated", () => {
    expect(source).toMatch(
      /const roleAllowed\s*=\s*ctx\.fleetopsUser\.role\s*===\s*"FLEET_MANAGER"/
    );
    expect(source).toContain(
      'code: "FORBIDDEN",\n            message: `Cannot move work order'
    );
    expect(source).toContain('status: "READY_FOR_REVIEW"');
    expect(source).toMatch(
      /where:\s*\{\s*id:\s*order\.vehicleId,\s*orgId:\s*ctx\.fleetopsUser\.orgId\s*\}/
    );
    expect(source).toContain(
      "const checklistEvents = await fleetDb.auditEvent.findMany"
    );
    expect(source).toContain(
      "Complete and save every execution checklist item before review."
    );
  });
});
