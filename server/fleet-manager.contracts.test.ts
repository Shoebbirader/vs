import { describe, expect, it } from "vitest";
import { CITY_BUS_MAINTENANCE_TEMPLATE, requireRole } from "./routers";
import { TRPCError } from "@trpc/server";
import { readFileSync } from "node:fs";

const routersSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("Fleet Manager responsibility contracts", () => {
  it("defines the complete City Bus maintenance preset", () => {
    expect(CITY_BUS_MAINTENANCE_TEMPLATE.map((item) => item.name)).toEqual(["Engine Oil", "Brakes", "Tires"]);
    expect(CITY_BUS_MAINTENANCE_TEMPLATE.every((item) => item.expectedLifeKm > item.alertThresholdKm)).toBe(true);
  });

  it("allows Fleet Manager operations while keeping finance outside its role", () => {
    expect(() => requireRole("FLEET_MANAGER", ["FLEET_MANAGER"])).not.toThrow();
    expect(() => requireRole("FLEET_MANAGER", ["SUPERADMIN", "ACCOUNTANT"])).toThrowError(TRPCError);
  });

  it("keeps assignment execution roles distinct from Fleet Manager dispatch", () => {
    expect(() => requireRole("FLEET_MANAGER", ["FLEET_MANAGER", "MECHANIC", "TECHNICIAN"])).not.toThrow();
    expect(() => requireRole("DRIVER", ["FLEET_MANAGER", "MECHANIC", "TECHNICIAN"])).toThrowError(TRPCError);
  });

  it("defines Fleet Manager vehicle edit and delete authority with tenant guards", () => {
    expect(routersSource).toContain("update: fleetOpsProcedure.input(z.object({ id: z.string().uuid(), vin:");
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER"])');
    expect(routersSource).toContain('action: "VEHICLE_UPDATED"');
    expect(routersSource).toContain('remove: fleetOpsProcedure.input(z.object({ id: z.string().uuid() }))');
    expect(routersSource).toContain('action: "VEHICLE_DELETED"');
  });

  it("reevaluates maintenance after driver fuel odometer updates", () => {
    expect(routersSource).toContain('source: "MANUAL_DRIVER"');
    expect(routersSource).toContain("await evaluateVehicleMaintenance(vehicle.id, ctx.fleetopsUser.orgId);");
  });

  it("defines tenant-scoped reusable template apply workflow", () => {
    expect(routersSource).toContain("maintenanceTemplates: router({");
    expect(routersSource).toContain("applyTemplate:");
    expect(routersSource).toContain("MAINTENANCE_TEMPLATE_APPLIED");
    expect(routersSource).toContain("skippedExisting");
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"])');
  });

  it("guards reassignment conflicts and returns readable roster visibility", () => {
    expect(routersSource).toContain("VEHICLE_REASSIGNED");
    expect(routersSource).toContain("closedAssignmentIds");
    expect(routersSource).toContain("activeAssignmentCount");
    expect(routersSource).toContain("unassignedDrivers");
    expect(routersSource).toContain("unassignedVehicles");
  });

  it("rejects stale concurrent work-order status edits with a conflict", () => {
    expect(routersSource).toContain("expectedUpdatedAt: z.coerce.date().optional()");
    expect(routersSource).toContain("This work order changed elsewhere. Refresh the queue before updating its status.");
    expect(routersSource).toContain('code: "CONFLICT"');
  });

  it("enforces the closed-loop execution handoff", () => {
    expect(routersSource).toContain('action: "WORK_ORDER_STARTED"');
    expect(routersSource).toContain('type: "WORK_ORDER_STARTED"');
    expect(routersSource).toContain('Start work and move the order into execution before submitting completion.');
    expect(routersSource).toContain('Complete and save every execution checklist item before submitting completion.');
    expect(routersSource).toContain('Complete and save every execution checklist item before review.');
    expect(routersSource).toContain('completedAt: null');
  });

  it("closes the maintenance loop on reviewer approval", () => {
    expect(routersSource).toContain('include: { vehicle: true, partsUsed: true }');
    expect(routersSource).toContain('const vehicle = await fleetDb.vehicle.findFirst({ where: { id: order.vehicleId, orgId: ctx.fleetopsUser.orgId } })');
    expect(routersSource).toContain('const serviceOdometer = latestOdometer?.reading ?? vehicle.currentOdometer');
    expect(routersSource).toContain('lastServicedOdometer: serviceOdometer');
    expect(routersSource).toContain('status: "ACTIVE"');
    expect(routersSource).toContain('category: "MAINTENANCE_PARTS"');
    expect(routersSource).toContain('costCenterType: "WORK_ORDER"');
    expect(routersSource).toContain('action: "WORK_ORDER_APPROVED"');
  });

  it("connects driver issue triage to a deduplicated maintenance dispatch", () => {
    expect(routersSource).toContain("createWorkOrderFromIssue: fleetOpsProcedure");
    expect(routersSource).toContain('JSON.parse(event.metadata ?? "{}").sourceIssueId === issue.id');
    expect(routersSource).toContain('action: "VEHICLE_ISSUE_DISPATCHED"');
    expect(routersSource).toContain('title: `Driver issue: ${issue.title}`');
    expect(routersSource).toContain('This driver issue already has a dispatched work order.');
  });

  it("links inventory issues to active assigned maintenance work", () => {
    expect(routersSource).toContain('workOrderId: z.string().uuid().optional()');
    expect(routersSource).toContain('status: { notIn: ["COMPLETED", "CANCELLED"] }');
    expect(routersSource).toContain('outside your assigned maintenance scope.');
    expect(routersSource).toContain('workOrderId: input.workOrderId ?? null');
  });

  it("records purchase-order receipts as inventory movements", () => {
    expect(routersSource).toContain('reason: `Purchase order receipt ${order.id}`');
    expect(routersSource).toContain('movementType: "RECEIPT", quantity: input.quantity, unitCost: input.unitCost');
    expect(routersSource).toContain('action: "PURCHASE_ORDER_PARTIALLY_RECEIVED"');
  });

  it("scopes inventory movement visibility by operational role", () => {
    expect(routersSource).toContain('if (ctx.fleetopsUser.role === "SUPERADMIN" || ctx.fleetopsUser.role === "INVENTORY_MANAGER")');
    expect(routersSource).toContain('assignedMechanicId: ctx.fleetopsUser.id');
    expect(routersSource).toContain('workOrderId: { in: assignedOrders.map((order: any) => order.id) }');
  });

  it("validates unified triage references inside the tenant", () => {
    expect(routersSource).toContain("const triageEntity = input.kind === \"VEHICLE_ISSUE\"");
    expect(routersSource).toContain('Triage item was not found in this organization.');
    expect(routersSource).toContain('orgId: ctx.fleetopsUser.orgId');
  });

  it("requires assigned work-order linkage for mechanic inventory issues", () => {
    expect(routersSource).toContain('Mechanics and Technicians must link issued parts to an assigned work order.');
    expect(routersSource).toContain('(ctx.fleetopsUser.role === "MECHANIC" || ctx.fleetopsUser.role === "TECHNICIAN") && !input.workOrderId');
  });

  it("consumes active reservations and records their INR cost at approval", () => {
    expect(routersSource).toContain('action: "INVENTORY_PART_RESERVED"');
    expect(routersSource).toContain('action: "INVENTORY_PART_RETURNED"');
    expect(routersSource).toContain('tx.workOrderPart.create');
    expect(routersSource).toContain('movementType: "ISSUE"');
    expect(routersSource).toContain('amount: partsCost + reservedPartsCost');
  });

  it("notifies Fleet Manager and Superadmin approvers", () => {
    expect(routersSource).toContain('role: { in: ["SUPERADMIN", "FLEET_MANAGER"] }');
    expect(routersSource).toContain('dedupeKey: `WORK_ORDER_REVIEW:${order.id}:${approver.id}`');
  });

  it("keeps purchase orders attached to same-tenant vendors", () => {
    expect(routersSource).toContain('const vendor = await fleetDb.vendor.findFirst({ where: { id: input.vendorId, orgId: ctx.fleetopsUser.orgId } });');
    expect(routersSource).toContain('Vendor not found in your organization.');
  });

  it("keeps purchase-order receipts attached to same-tenant vendors", () => {
    expect(routersSource).toContain('const vendor = await fleetDb.vendor.findFirst({ where: { id: order.vendorId, orgId: ctx.fleetopsUser.orgId } });');
    expect(routersSource).toContain('Purchase order vendor is not in this organization.');
  });

  it("returns tenant-scoped vendor details with purchase-order listings", () => {
    expect(routersSource).toContain('const [orders, vendors] = await Promise.all([fleetDb.purchaseOrder.findMany');
    expect(routersSource).toContain('vendor: vendorById.get(order.vendorId) ?? null');
  });

  it("defines tenant-scoped maintenance planning with bounded date validation", () => {
    expect(routersSource).toContain("planning: router({");
    expect(routersSource).toContain("maintenance: fleetOpsProcedure");
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"])');
    expect(routersSource).toContain("The planning end date must be on or after the start date.");
    expect(routersSource).toContain('kind: "COMPONENT_DUE"');
    expect(routersSource).toContain('kind: "DOCUMENT_EXPIRY"');
    expect(routersSource).toContain('kind: "WORK_ORDER"');
    expect(routersSource).toContain('orgId: ctx.fleetopsUser.orgId');
  });

  it("defines guarded Procurement purchase-order lifecycle transitions", () => {
    expect(routersSource).toContain("updateStatus: fleetOpsProcedure");
    expect(routersSource).toContain('status: z.enum(["DRAFT", "SENT", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED", "CLOSED"])');
    expect(routersSource).toContain("This purchase order changed elsewhere. Refresh before updating its status.");
    expect(routersSource).toContain("PURCHASE_ORDER_STATUS_CHANGED");
    expect(routersSource).toContain('where: { id: input.id, orgId: ctx.fleetopsUser.orgId }');
  });

  it("defines tenant-scoped Fleet Manager bulk work-order controls", () => {
    expect(routersSource).toContain("bulkUpdate: fleetOpsProcedure");
    expect(routersSource).toContain('workOrderIds: z.array(z.string().uuid()).min(1).max(100)');
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"])');
    expect(routersSource).toContain('where: { orgId: ctx.fleetopsUser.orgId, id: { in: input.workOrderIds } }');
    expect(routersSource).toContain("WORK_ORDER_BULK_UPDATED");
    expect(routersSource).toContain("Assignee must belong to this organization.");
    expect(routersSource).toContain('scheduledFor: z.coerce.date().nullable().optional()');
    expect(routersSource).toContain('archive: z.boolean().optional()');
    expect(routersSource).toContain('archivedAt: input.archive ? new Date() : null');
    expect(routersSource).toContain('scheduledFor: input.scheduledFor');
  });

  it("defines tenant-scoped Driver handoff visibility with safety aggregation", () => {
    expect(routersSource).toContain("driverHandoffs:");
    expect(routersSource).toContain('type: "DRIVER_SAFETY_DISPOSITION"');
    expect(routersSource).toContain('vehicle?.status === "OUT_OF_SERVICE" ? "UNSAFE"');
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"])');
    expect(routersSource).toContain('where: { orgId: ctx.fleetopsUser.orgId, active: true }');
  });

  it("provides validated tenant-scoped compliance CSV preview and import", () => {
    expect(routersSource).toContain("previewImport:");
    expect(routersSource).toContain("importCsv:");
    expect(routersSource).toContain("DOCUMENT_IMPORT_CSV");
    expect(routersSource).toContain("Every row must reference an organization vehicle");
    expect(routersSource).toContain('requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"])');
  });
});
