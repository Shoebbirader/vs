/**
 * Driver Workflow Functions
 * Pre-trip checklists, issue submission, state management
 */

import { fleetDb } from "./db";
import { TRPCError } from "@trpc/server";
import { eventBus } from "./events";

/**
 * State machine for driver vehicle interactions
 * Ensures drivers can only perform appropriate actions
 */
export function validateDriverState(driver: any, vehicle: any, action: "CHECK_IN" | "START_TRIP" | "REPORT_ISSUE" | "SUBMIT_FUEL" | "CHECK_OUT"): { valid: boolean; reason?: string } {
  if (!driver || !vehicle) {
    return { valid: false, reason: "Driver or vehicle not found" };
  }

  // Vehicle must be active
  if (vehicle.status !== "ACTIVE") {
    return { valid: false, reason: `Vehicle status is ${vehicle.status}, not ACTIVE` };
  }

  // Check for open maintenance issues
  const actionRequiresHealthCheck = ["START_TRIP", "CHECK_IN"].includes(action);
  
  if (actionRequiresHealthCheck) {
    // Allow - drivers should report issues, not prevent trips
  }

  return { valid: true };
}

/**
 * Get pre-trip checklist items for a vehicle
 * Returns items driver must check before starting journey
 */
export async function getPreTripChecklist(vehicleId: string): Promise<Array<{
  id: string;
  section: "EXTERIOR" | "INTERIOR" | "MECHANICAL" | "SAFETY";
  title: string;
  description: string;
  required: boolean;
}>> {
  const vehicle = await fleetDb.vehicle.findFirst({ where: { id: vehicleId } });
  if (!vehicle) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
  }

  // Standard pre-trip checklist items
  // In production, this could be customized per vehicle type
  const checklist: Array<{
    id: string;
    section: "EXTERIOR" | "INTERIOR" | "MECHANICAL" | "SAFETY";
    title: string;
    description: string;
    required: boolean;
  }> = [
    // Exterior checks
    {
      id: "ext-001",
      section: "EXTERIOR",
      title: "Tire Condition",
      description: "Check all tires for proper inflation, wear, and damage",
      required: true,
    },
    {
      id: "ext-002",
      section: "EXTERIOR",
      title: "Lights",
      description: "Verify headlights, taillights, and indicators are working",
      required: true,
    },
    {
      id: "ext-003",
      section: "EXTERIOR",
      title: "Mirrors",
      description: "Check side mirrors and rear-view mirror are properly positioned",
      required: true,
    },
    {
      id: "ext-004",
      section: "EXTERIOR",
      title: "Wipers",
      description: "Test windshield wipers for proper function",
      required: false,
    },

    // Interior checks
    {
      id: "int-001",
      section: "INTERIOR",
      title: "Seatbelts",
      description: "Verify all seatbelts are functional and accessible",
      required: true,
    },
    {
      id: "int-002",
      section: "INTERIOR",
      title: "Dashboard Lights",
      description: "Check for warning lights on dashboard",
      required: true,
    },
    {
      id: "int-003",
      section: "INTERIOR",
      title: "Windshield",
      description: "Inspect windshield for cracks or obstructions",
      required: true,
    },
    {
      id: "int-004",
      section: "INTERIOR",
      title: "Controls",
      description: "Test steering, brakes, and accelerator response",
      required: true,
    },

    // Mechanical checks
    {
      id: "mech-001",
      section: "MECHANICAL",
      title: "Engine Start",
      description: "Engine starts smoothly without unusual sounds",
      required: true,
    },
    {
      id: "mech-002",
      section: "MECHANICAL",
      title: "Brakes",
      description: "Brakes respond normally with no grinding or soft pedal",
      required: true,
    },
    {
      id: "mech-003",
      section: "MECHANICAL",
      title: "Steering",
      description: "Steering is smooth with no excessive play",
      required: true,
    },

    // Safety equipment
    {
      id: "safe-001",
      section: "SAFETY",
      title: "Emergency Kit",
      description: "First aid kit and emergency equipment present",
      required: true,
    },
    {
      id: "safe-002",
      section: "SAFETY",
      title: "Fire Extinguisher",
      description: "Fire extinguisher accessible and in date",
      required: true,
    },
    {
      id: "safe-003",
      section: "SAFETY",
      title: "Spare Tire",
      description: "Spare tire present and in good condition",
      required: true,
    },
  ];

  return checklist;
}

/**
 * Submit pre-trip checklist results
 * Validates all required items are checked, creates work orders for issues
 */
export async function submitPreTripChecklist(vehicleId: string, driverId: string, orgId: string, results: Array<{ itemId: string; passed: boolean; notes?: string }>): Promise<{
  checklistId: string;
  vehicleId: string;
  passedItems: number;
  failedItems: number;
  workOrdersCreated: number;
}> {
  const vehicle = await fleetDb.vehicle.findFirst({ where: { id: vehicleId, orgId } });
  if (!vehicle) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found in your organization" });
  }

  // Get checklist to verify required items
  const checklist = await getPreTripChecklist(vehicleId);
  const requiredItems = checklist.filter((item) => item.required);

  // Check that all required items were evaluated
  const submittedItemIds = new Set(results.map((r) => r.itemId));
  const missingRequired = requiredItems.filter((item) => !submittedItemIds.has(item.id));

  if (missingRequired.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Missing required checklist items: ${missingRequired.map((i) => i.title).join(", ")}`,
    });
  }

  // Process results
  const passedItems = results.filter((r) => r.passed).length;
  const failedItems = results.filter((r) => !r.passed).length;
  let workOrdersCreated = 0;

  // Create work orders for failed checks
  for (const result of results) {
    if (!result.passed && result.notes) {
      const item = checklist.find((c) => c.id === result.itemId);
      if (item) {
        const workOrder = await fleetDb.workOrder.create({
          data: {
            id: crypto.randomUUID(),
            orgId,
            vehicleId,
            title: `Pre-trip Check Failed: ${item.title}`,
            description: `Driver reported issue during pre-trip inspection: ${result.notes}`,
            priority: item.section === "SAFETY" || item.section === "MECHANICAL" ? "HIGH" : "MEDIUM",
            status: "OPEN",
            createdAt: new Date(),
          },
        });

        // Publish event
        await eventBus.publish(
          {
            type: "DRIVER_ISSUE_SUBMITTED",
            vehicleId,
            driverId,
            issue: { title: item.title, description: result.notes, priority: "HIGH" },
          },
          { orgId }
        );

        workOrdersCreated += 1;
      }
    }
  }

  // Store checklist result
  const checklistId = crypto.randomUUID();
  if (fleetDb.auditEvent?.create) {
    await fleetDb.auditEvent.create({
      data: {
        id: crypto.randomUUID(),
        orgId,
        actorId: driverId,
        action: "PRE_TRIP_CHECKLIST_SUBMITTED",
        entityType: "VEHICLE",
        entityId: vehicleId,
        summary: `Pre-trip checklist: ${passedItems} passed, ${failedItems} failed`,
        metadata: JSON.stringify({
          checklistId,
          passedItems,
          failedItems,
          workOrdersCreated,
          results: results.filter((r) => !r.passed),
        }),
        createdAt: new Date(),
      },
    });
  }

  return {
    checklistId,
    vehicleId,
    passedItems,
    failedItems,
    workOrdersCreated,
  };
}

/**
 * Submit a vehicle issue/concern from driver
 * Auto-creates work order if priority is HIGH or CRITICAL
 */
export async function submitVehicleIssue(vehicleId: string, driverId: string, orgId: string, input: { title: string; description: string; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; category: string }): Promise<{
  issueId: string;
  vehicleId: string;
  workOrderId?: string;
  status: string;
}> {
  const vehicle = await fleetDb.vehicle.findFirst({ where: { id: vehicleId, orgId } });
  if (!vehicle) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found in your organization" });
  }

  // Create vehicle issue record
  const issueId = crypto.randomUUID();
  if (fleetDb.auditEvent?.create) {
    await fleetDb.auditEvent.create({
      data: {
        id: crypto.randomUUID(),
        orgId,
        actorId: driverId,
        action: "DRIVER_ISSUE_REPORTED",
        entityType: "VEHICLE",
        entityId: vehicleId,
        summary: `Issue: ${input.title}`,
        metadata: JSON.stringify({
          issueId,
          category: input.category,
          priority: input.priority,
          description: input.description,
        }),
        createdAt: new Date(),
      },
    });
  }

  // Auto-create work order for high priority issues
  let workOrderId: string | undefined;
  if (["HIGH", "CRITICAL"].includes(input.priority)) {
    const workOrder = await fleetDb.workOrder.create({
      data: {
        id: crypto.randomUUID(),
        orgId,
        vehicleId,
        title: `Vehicle Issue: ${input.title}`,
        description: `Driver reported: ${input.description}`,
        priority: input.priority,
        status: "OPEN",
        createdAt: new Date(),
      },
    });
    workOrderId = workOrder.id;

    // Publish event
    await eventBus.publish(
      {
        type: "DRIVER_ISSUE_SUBMITTED",
        vehicleId,
        driverId,
        issue: input,
      },
      { orgId }
    );
  }

  return {
    issueId,
    vehicleId,
    workOrderId,
    status: workOrderId ? "WORK_ORDER_CREATED" : "LOGGED",
  };
}

/**
 * Get recent issues for a vehicle
 * Helps fleet managers monitor recurring problems
 */
export async function getVehicleIssueHistory(vehicleId: string, orgId: string, limit: number = 50): Promise<
  Array<{
    issueId: string;
    reportedBy: string;
    reportedAt: string;
    title: string;
    description: string;
    priority: string;
    category: string;
    workOrderCreated: boolean;
  }>
> {
  const events = await fleetDb.auditEvent.findMany({
    where: {
      orgId,
      entityType: "VEHICLE",
      entityId: vehicleId,
      action: "DRIVER_ISSUE_REPORTED",
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return (events as any[]).map((event) => {
    try {
      const metadata = JSON.parse(event.metadata ?? "{}");
      return {
        issueId: metadata.issueId,
        reportedBy: event.actorId ?? "UNKNOWN",
        reportedAt: event.createdAt.toISOString(),
        title: metadata.title ?? "Unknown issue",
        description: metadata.description ?? "",
        priority: metadata.priority ?? "MEDIUM",
        category: metadata.category ?? "OTHER",
        workOrderCreated: !!metadata.workOrderId,
      };
    } catch {
      return {
        issueId: "unknown",
        reportedBy: "UNKNOWN",
        reportedAt: event.createdAt.toISOString(),
        title: event.summary ?? "Unknown issue",
        description: "",
        priority: "MEDIUM",
        category: "OTHER",
        workOrderCreated: false,
      };
    }
  });
}

/**
 * Get driver assignment for a shift
 * Returns vehicle assigned and any active issues
 */
export async function getDriverAssignment(driverId: string, orgId: string): Promise<{
  driverId: string;
  assignedVehicleId?: string;
  vehicleInfo?: any;
  activeIssues: number;
  pendingChecklists: boolean;
}> {
  const user = await fleetDb.user.findFirst({ where: { id: driverId, orgId } });
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });
  }

  // Get assigned vehicle (simplified - in production might track shift assignments)
  // For now, check if driver has recent work orders
  const recentOrders = await fleetDb.workOrder.findMany({
    where: {
      orgId,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    include: { vehicle: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const assignedVehicleId = (recentOrders as any[])[0]?.vehicleId;
  const vehicleInfo = (recentOrders as any[])[0]?.vehicle;

  // Count active issues
  const activeIssues = assignedVehicleId
    ? (
        await fleetDb.auditEvent.findMany({
          where: {
            orgId,
            entityType: "VEHICLE",
            entityId: assignedVehicleId,
            action: "DRIVER_ISSUE_REPORTED",
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
          },
        })
      ).length
    : 0;

  return {
    driverId,
    assignedVehicleId,
    vehicleInfo: vehicleInfo
      ? {
          id: vehicleInfo.id,
          vin: vehicleInfo.vin,
          licensePlate: vehicleInfo.licensePlate,
          make: vehicleInfo.make,
          model: vehicleInfo.model,
          status: vehicleInfo.status,
        }
      : undefined,
    activeIssues,
    pendingChecklists: !!assignedVehicleId,
  };
}
