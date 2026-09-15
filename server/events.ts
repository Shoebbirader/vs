import { fleetDb } from "./db";
import { logRequestSignal } from "./observability";

/**
 * Domain Events - All business events that trigger side effects
 * Each event represents something that happened in the system
 */
export type DomainEvent =
  | { type: "WORK_ORDER_CREATED"; workOrder: any }
  | { type: "WORK_ORDER_COMPLETED"; workOrder: any; partsUsed: any[] }
  | { type: "WORK_ORDER_STATUS_CHANGED"; workOrderId: string; previousStatus: string; newStatus: string }
  | { type: "PARTS_USED"; workOrderId: string; parts: any[] }
  | { type: "VEHICLE_CREATED"; vehicle: any }
  | { type: "VEHICLE_MAINTENANCE_DUE"; vehicleId: string; componentId: string; component: any }
  | { type: "COMPONENT_SERVICE_BASELINE_RESET"; componentId: string; previousOdometer: number; currentOdometer: number }
  | { type: "ODOMETER_UPDATED"; vehicleId: string; reading: number; source: string }
  | { type: "INVENTORY_CREATED"; part: any }
  | { type: "INVENTORY_LOW"; partId: string; part: any; quantityOnHand: number; minReorderLevel: number }
  | { type: "PURCHASE_ORDER_CREATED"; purchaseOrder: any }
  | { type: "PURCHASE_ORDER_RECEIVED"; purchaseOrderId: string; partId: string; quantity: number }
  | { type: "DOCUMENT_EXPIRY_ALERT"; documentId: string; document: any; daysUntilExpiry: number }
  | { type: "NOTIFICATION_CREATED"; notification: any; recipient: any }
  | { type: "DRIVER_ISSUE_SUBMITTED"; vehicleId: string; driverId: string; issue: any }
  | { type: "ISSUE_ACKNOWLEDGED"; issueId: string; acknowledgedBy: string };

/**
 * Handler function type
 */
type EventHandler = (event: DomainEvent, context: { orgId?: string }) => Promise<void>;

/**
 * Event Publisher - In-memory event bus
 * Accumulates handlers and publishes events
 */
class EventPublisher {
  private handlers: Map<DomainEvent["type"], EventHandler[]> = new Map();
  private eventLog: Array<{ event: DomainEvent; timestamp: Date; success: boolean; error?: string }> = [];

  subscribe(eventType: DomainEvent["type"], handler: EventHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  async publish(event: DomainEvent, context: { orgId?: string } = {}) {
    const timestamp = new Date();
    let success = false;
    let error: string | undefined;

    try {
      const handlers = this.handlers.get(event.type) || [];
      
      // Fire all handlers in parallel, but don't wait (non-blocking)
      Promise.all(
        handlers.map((handler) =>
          handler(event, context).catch((err) => {
            console.error(`Error in event handler for ${event.type}:`, err);
          })
        )
      ).catch(() => {
        // Silently catch - we don't want handler errors blocking the caller
      });

      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error(`Event publishing error for ${event.type}:`, error);
    }

    // Log event
    this.eventLog.push({ event, timestamp, success, error });
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(-500); // Keep only last 500
    }
  }

  getLog() {
    return [...this.eventLog];
  }

  clearLog() {
    this.eventLog = [];
  }
}

// Global event bus instance
export const eventBus = new EventPublisher();

/**
 * Event Handlers - Side effects triggered by events
 */

/**
 * Handler: When work order completes, update component service baseline
 */
async function onWorkOrderCompleted(event: DomainEvent, context: { orgId?: string }) {
  if (event.type !== "WORK_ORDER_COMPLETED") return;
  
  const { workOrder, partsUsed } = event;
  
  // Find which components were serviced based on parts used
  const componentIds = await fleetDb.component.findMany({
    where: { vehicleId: workOrder.vehicleId }
  });

  for (const component of componentIds as any[]) {
    // If this component had parts replaced, reset service baseline
    if (partsUsed.some((part: any) => part.partId === component.inventoryPartId)) {
      await fleetDb.component.update({
        where: { id: component.id },
        data: { lastServicedOdometer: workOrder.vehicle?.currentOdometer || component.lastServicedOdometer }
      });
    }
  }
}

/**
 * Handler: Track maintenance due events for analytics
 */
async function onVehicleMaintenanceDue(event: DomainEvent, context: { orgId?: string }) {
  if (event.type !== "VEHICLE_MAINTENANCE_DUE") return;
  
  const { vehicleId, componentId, component } = event;
  
  // Create maintenance alert record
  // This could be used for dashboards, reports, SLA tracking
  await fleetDb.auditEvent?.create?.({
    data: {
      id: crypto.randomUUID(),
      orgId: context.orgId,
      action: "MAINTENANCE_DUE_DETECTED",
      entityType: "COMPONENT",
      entityId: componentId,
      summary: `${component.name} maintenance due on vehicle ${vehicleId}`,
      metadata: JSON.stringify({
        componentId,
        vehicleId,
        componentType: component.componentType,
        expectedLifeKm: component.expectedLifeKm,
        alertThresholdKm: component.alertThresholdKm
      }),
      createdAt: new Date()
    }
  }).catch(() => {
    // Audit event creation optional
  });
}

/**
 * Handler: Create inventory movement records for cost tracking
 */
async function onPartsUsed(event: DomainEvent, context: { orgId?: string }) {
  if (event.type !== "PARTS_USED") return;
  
  const { workOrderId, parts } = event;
  
  // Record movement for each part
  for (const part of parts) {
    if (fleetDb.inventoryMovement?.create) {
      await fleetDb.inventoryMovement.create({
        data: {
          id: crypto.randomUUID(),
          orgId: context.orgId,
          partId: part.partId,
          workOrderId,
          actorId: part.usedBy,
          movementType: "USAGE",
          quantity: -part.qtyUsed, // Negative for consumption
          unitCost: part.unitPrice,
          reason: `Used in work order ${workOrderId}`,
          createdAt: new Date()
        }
      }).catch(() => {
        // Movement tracking optional
      });
    }
  }
}

/**
 * Handler: Check inventory levels after parts used
 */
async function onInventoryMovement(event: DomainEvent, context: { orgId?: string }) {
  if (event.type !== "PARTS_USED") return;
  
  const { parts } = event;
  
  // Check each part for low stock
  for (const part of parts) {
    const inventory = await fleetDb.inventoryPart.findFirst({
      where: { id: part.partId, orgId: context.orgId }
    });

    if (inventory && inventory.quantityOnHand <= inventory.minReorderLevel) {
      // Publish low inventory event for notification system
      await eventBus.publish({
        type: "INVENTORY_LOW",
        partId: part.partId,
        part: inventory,
        quantityOnHand: inventory.quantityOnHand,
        minReorderLevel: inventory.minReorderLevel
      }, context);
    }
  }
}

/**
 * Handler: Track document expiry for compliance
 */
async function onDocumentExpiryAlert(event: DomainEvent, context: { orgId?: string }) {
  if (event.type !== "DOCUMENT_EXPIRY_ALERT") return;
  
  const { documentId, daysUntilExpiry } = event;
  
  // Create compliance alert
  await fleetDb.auditEvent?.create?.({
    data: {
      id: crypto.randomUUID(),
      orgId: context.orgId,
      action: "DOCUMENT_EXPIRY_ALERT",
      entityType: "DOCUMENT",
      entityId: documentId,
      summary: `Document expires in ${daysUntilExpiry} days`,
      createdAt: new Date()
    }
  }).catch(() => {
    // Audit optional
  });
}

/**
 * Handler: Auto-create work order from driver issue
 */
async function onDriverIssueSubmitted(event: DomainEvent, context: { orgId?: string }) {
  if (event.type !== "DRIVER_ISSUE_SUBMITTED") return;
  
  const { vehicleId, driverId, issue } = event;
  
  // Auto-create work order for issues marked as high priority
  if (issue.priority === "HIGH" || issue.priority === "CRITICAL") {
    const workOrder = await fleetDb.workOrder.create({
      data: {
        id: crypto.randomUUID(),
        orgId: context.orgId,
        vehicleId,
        title: `Vehicle Issue: ${issue.title}`,
        description: `Driver reported: ${issue.description}`,
        priority: issue.priority,
        status: "OPEN",
        createdAt: new Date()
      }
    });

    // Log the auto-creation
    await fleetDb.auditEvent?.create?.({
      data: {
        id: crypto.randomUUID(),
        orgId: context.orgId,
        action: "AUTO_WORK_ORDER_CREATED",
        entityType: "WORK_ORDER",
        entityId: workOrder.id,
        summary: `Auto-created from driver issue`,
        metadata: JSON.stringify({ issueId: issue.id, driverId }),
        createdAt: new Date()
      }
    }).catch(() => {});
  }
}

/**
 * Setup event handlers
 * Called during server initialization
 */
export function setupEventHandlers() {
  // Maintenance handlers
  eventBus.subscribe("WORK_ORDER_COMPLETED", onWorkOrderCompleted);
  eventBus.subscribe("VEHICLE_MAINTENANCE_DUE", onVehicleMaintenanceDue);
  eventBus.subscribe("COMPONENT_SERVICE_BASELINE_RESET", onVehicleMaintenanceDue);

  // Inventory handlers
  eventBus.subscribe("PARTS_USED", onPartsUsed);
  eventBus.subscribe("PARTS_USED", onInventoryMovement);
  eventBus.subscribe("PURCHASE_ORDER_RECEIVED", onInventoryMovement);

  // Compliance handlers
  eventBus.subscribe("DOCUMENT_EXPIRY_ALERT", onDocumentExpiryAlert);

  // Driver workflow handlers
  eventBus.subscribe("DRIVER_ISSUE_SUBMITTED", onDriverIssueSubmitted);

  console.log("✓ Event handlers registered");
}

/**
 * Export for use in routers
 * Usage: await eventBus.publish({ type: "WORK_ORDER_COMPLETED", workOrder, partsUsed }, { orgId })
 */
export { EventPublisher };
