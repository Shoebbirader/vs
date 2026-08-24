import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { requireRole } from "./routers";

const routersSource = fs.readFileSync(path.resolve(import.meta.dirname, "routers.ts"), "utf8");

describe("Milestone 1 operational contracts", () => {
  it("keeps organization audit history Superadmin-only and filterable by governance dimensions", () => {
    expect(() => requireRole("SUPERADMIN", ["SUPERADMIN"])).not.toThrow();
    expect(() => requireRole("FLEET_MANAGER", ["SUPERADMIN"])).toThrowError(TRPCError);
    expect(() => requireRole("ACCOUNTANT", ["SUPERADMIN"])).toThrowError(TRPCError);
    for (const filter of ["actorId", "actorRole", "entityType", "action", "outcome", "dateFrom", "dateTo"]) expect(routersSource).toContain(filter);
    expect(routersSource).toContain('outcome: z.enum(["SUCCESS", "ERROR"])');
    expect(routersSource).toContain("orgId: ctx.fleetopsUser.orgId");
  });

  it("keeps driver issue triage inside management roles", () => {
    expect(() => requireRole("FLEET_MANAGER", ["SUPERADMIN", "FLEET_MANAGER"])).not.toThrow();
    expect(() => requireRole("SUPERADMIN", ["SUPERADMIN", "FLEET_MANAGER"])).not.toThrow();
    expect(() => requireRole("DRIVER", ["SUPERADMIN", "FLEET_MANAGER"])).toThrowError(TRPCError);
  });

  it("keeps inventory movement history available to inventory and maintenance operators", () => {
    for (const role of ["SUPERADMIN", "INVENTORY_MANAGER", "MECHANIC", "TECHNICIAN"]) {
      expect(() => requireRole(role, ["SUPERADMIN", "INVENTORY_MANAGER", "MECHANIC", "TECHNICIAN"])).not.toThrow();
    }
    expect(() => requireRole("DRIVER", ["SUPERADMIN", "INVENTORY_MANAGER", "MECHANIC", "TECHNICIAN"])).toThrowError(TRPCError);
  });

  it("keeps compliance documents more restricted than maintenance evidence", () => {
    expect(() => requireRole("FLEET_MANAGER", ["SUPERADMIN", "FLEET_MANAGER"])).not.toThrow();
    expect(() => requireRole("MECHANIC", ["SUPERADMIN", "FLEET_MANAGER"])).toThrowError(TRPCError);
    expect(() => requireRole("MECHANIC", ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN"])).not.toThrow();
  });

  it("defines a tenant-scoped unified triage queue with operational sources", () => {
    expect(routersSource).toContain("triage: router({");
    expect(routersSource).toContain("queue: fleetOpsProcedure.query");
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"])');
    expect(routersSource).toContain("vehicleIssue.findMany");
    expect(routersSource).toContain("inventoryPart.findMany");
    expect(routersSource).toContain("actionable: true");
    expect(routersSource).toContain("triageState");
    expect(routersSource).toContain('state: z.enum(["ACKNOWLEDGED", "ASSIGNED", "DEFERRED", "RESOLVED"])');
    expect(routersSource).toContain("TRIAGE_STATE_CHANGED");
  });

  it("defines explicit work-order lifecycle states and guarded transitions", () => {
    for (const state of ["WAITING_FOR_PARTS", "READY_FOR_REVIEW", "REWORK", "CANCELLED"]) expect(routersSource).toContain(state);
    expect(routersSource).toContain("WORK_ORDER_STATUS_CHANGED");
    expect(routersSource).toContain("Cannot move work order from");
    expect(routersSource).toContain("updateChecklist: fleetOpsProcedure.input");
    expect(routersSource).toContain("approve: fleetOpsProcedure.input");
    expect(routersSource).toContain("WORK_ORDER_CHECKLIST_UPDATED");
    expect(routersSource).toContain("Complete every execution checklist item before approval");
    expect(routersSource).toContain("WORK_ORDER_READY_FOR_REVIEW");
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["MECHANIC", "TECHNICIAN"])');
  });

  it("defines tenant-scoped board and inventory movement procedures", () => {
    expect(routersSource).toContain("board: fleetOpsProcedure.query");
    expect(routersSource).toContain("receive: fleetOpsProcedure.input");
    expect(routersSource).toContain("issue: fleetOpsProcedure.input");
    expect(routersSource).toContain('movementType: \"RECEIPT\"');
    expect(routersSource).toContain("reservePart: fleetOpsProcedure.input");
    expect(routersSource).toContain("returnReservedPart: fleetOpsProcedure.input");
    expect(routersSource).toContain("INVENTORY_PART_RESERVED");
    expect(routersSource).toContain("INVENTORY_PART_RETURNED");
    expect(routersSource).toContain("Insufficient available stock after existing reservations");
    expect(routersSource).toContain('movementType: \"ISSUE\"');
    expect(routersSource).toContain("DOCUMENT_EXPORT_CSV");
    expect(routersSource).toContain("vahansync-compliance-");
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"])');
  });

  it("defines the Driver daily readiness and safety disposition loop", () => {
    expect(routersSource).toContain("dailyHome: fleetOpsProcedure.query");
    expect(routersSource).toContain("unsafeDisposition: fleetOpsProcedure.input");
    expect(routersSource).toContain('readiness === "UNSAFE"');
    expect(routersSource).toContain("DRIVER_SAFETY_DISPOSITION");
    expect(routersSource).toContain("Driver marked vehicle unsafe");
    expect(routersSource).toContain("active: true");
  });

  it("defines tenant-scoped Accountant fuel-ledger reconciliation", () => {
    expect(routersSource).toContain("reconcile: fleetOpsProcedure.query");
    expect(routersSource).toContain('category: "FUEL"');
    expect(routersSource).toContain("fuelLogged");
    expect(routersSource).toContain("ledgerFuel");
    expect(routersSource).toContain('status: Math.abs(difference) < 0.01 ? "MATCHED" : "MISMATCH"');
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"])');
  });

  it("defines Superadmin-only organization settings over the migrated table", () => {
    expect(routersSource).toContain("organizationSettings: router({");
    expect(routersSource).toContain("organizationSetting.findFirst");
    expect(routersSource).toContain("ORGANIZATION_SETTINGS_UPDATED");
    expect(routersSource).toContain('odometerMaxDailyKm: z.number().int().min(100).max(5000)');
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"])');
  });

  it("defines immutable financial approval and reversal controls", () => {
    expect(routersSource).toContain("approvalStatus");
    expect(routersSource).toContain("PENDING_APPROVAL");
    expect(routersSource).toContain("approvalQueue:");
    expect(routersSource).toContain("FINANCIAL_RECORD_APPROVED");
    expect(routersSource).toContain("FINANCIAL_RECORD_REVERSED");
    expect(routersSource).toContain("reversalOfId");
    expect(routersSource).toContain("already been reversed");
  });

  it("defines storage lifecycle safeguards and authorized access logging", () => {
    expect(routersSource).toContain("ALLOWED_DOCUMENT_TYPES");
    expect(routersSource).toContain("MAX_DOCUMENT_BYTES");
    expect(routersSource).toContain("fileChecksum");
    expect(routersSource).toContain("retentionUntil");
    expect(routersSource).toContain("malwareScanPolicy");
    expect(routersSource).toContain("lifecycle: fleetOpsProcedure.query");
    expect(routersSource).toContain("FILE_ACCESSED");
  });

  it("defines notification routing, deduplication, escalation, and source-aware resolution", () => {
    expect(routersSource).toContain("severity");
    expect(routersSource).toContain("sourceType");
    expect(routersSource).toContain("dedupeKey");
    expect(routersSource).toContain("acknowledgedAt");
    expect(routersSource).toContain("NOTIFICATION_ESCALATED");
    expect(routersSource).toContain("NOTIFICATION_RESOLVED");
    expect(routersSource).toContain("Resolve the source vehicle issue");
    expect(routersSource).toContain("Complete the source work order");
  });

  it("defines optimistic inventory adjustment conflict protection", () => {
    expect(routersSource).toContain("adjust: fleetOpsProcedure.input");
    expect(routersSource).toContain("expectedQuantityOnHand");
    expect(routersSource).toContain("Inventory changed since it was loaded");
    expect(routersSource).toContain("Inventory adjustments cannot produce a negative balance");
    expect(routersSource).toContain("INVENTORY_ADJUSTED");
  });
});
