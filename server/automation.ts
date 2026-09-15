import { fleetDb } from "./db";
import { logRequestSignal } from "./observability";
import { vehicleIdentity } from "./vehicle-identity";
import { deliverOperationalNotification } from "./twilio";

async function notifyRoles(orgId: string, roles: string[], title: string, message: string, type: string, referenceId?: string) {
  const recipients = await fleetDb.user.findMany({ where: { orgId, role: { in: roles } } });
  const severity = type === "MAINTENANCE_THRESHOLD" || type === "INVENTORY_LOW" ? "HIGH" : type === "DOCUMENT_EXPIRY" ? "CRITICAL" : "INFO";
  const sourceType = type === "MAINTENANCE_THRESHOLD" || type === "WORK_ORDER_ESCALATION" || type === "ALERT_ESCALATION" ? "WORK_ORDER" : type === "INVENTORY_LOW" || type === "PURCHASE_ORDER_DRAFT" ? "INVENTORY_LOW" : type === "DOCUMENT_EXPIRY" ? "DOCUMENT_EXPIRY" : "SYSTEM";
  const candidates = recipients.map((recipient: any) => ({ id: crypto.randomUUID(), orgId, recipientId: recipient.id, title, message, type, severity, sourceType, dedupeKey: `${type}:${referenceId ?? title}:${recipient.id}`, referenceId, isRead: false, createdAt: new Date() }));
  const notifications = fleetDb.notification?.findFirst ? (await Promise.all(candidates.map(async (candidate: any) => (await fleetDb.notification.findFirst({ where: { orgId, recipientId: candidate.recipientId, dedupeKey: candidate.dedupeKey, resolvedAt: null } })) ? null : candidate))).filter(Boolean) : candidates;
  if (notifications.length) {
    await fleetDb.notification.createMany({ data: notifications });
    await Promise.all(notifications.map((notification: any) => deliverOperationalNotification(notification, recipients.find((recipient: any) => recipient.id === notification.recipientId)).catch(() => undefined)));
  }
  return notifications.length;
}

export async function evaluateVehicleMaintenance(vehicleId: string, orgId: string) {
  const vehicle = await fleetDb.vehicle.findFirst({ where: { id: vehicleId, orgId } });
  if (!vehicle) return { createdWorkOrders: 0 };
  let createdWorkOrders = 0;
  const components = await fleetDb.component.findMany({ where: { vehicleId } });
  for (const component of components) {
    if (String(component.status ?? "ACTIVE") !== "ACTIVE") continue;
    const consumed = Number(vehicle.currentOdometer) - Number(component.lastServicedOdometer);
    const installationAt = new Date(component.installationDate ?? Date.now()).getTime();
    const elapsedDays = Math.max(0, Math.floor((Date.now() - installationAt) / 86_400_000));
    const dueByKm = consumed >= Number(component.alertThresholdKm);
    const dueByDays = Number(component.alertThresholdDays ?? 0) > 0 && elapsedDays >= Number(component.alertThresholdDays);
    if (!dueByKm && !dueByDays) continue;
    const existing = await fleetDb.workOrder.findFirst({ where: { orgId, vehicleId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_PARTS", "READY_FOR_REVIEW", "REWORK"] }, title: { contains: component.name } } });
    if (existing) continue;
    const priorTriggers = fleetDb.auditEvent?.findMany ? await fleetDb.auditEvent.findMany({ where: { orgId, entityType: "COMPONENT", entityId: component.id, action: "MAINTENANCE_THRESHOLD_TRIGGERED" }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
    const sameServiceBaselineAlreadyTriggered = (priorTriggers as any[]).some((event) => { try { return Number(JSON.parse(event.metadata ?? "{}").serviceBaseline ?? -1) === Number(component.lastServicedOdometer); } catch { return false; } });
    if (sameServiceBaselineAlreadyTriggered) continue;
    const consumedPercent = Number(component.expectedLifeKm) > 0 ? Math.round((consumed / Number(component.expectedLifeKm)) * 100) : 0;
    const elapsedPercent = Number(component.expectedLifeDays ?? 0) > 0 ? Math.round((elapsedDays / Number(component.expectedLifeDays)) * 100) : 0;
    const priority = consumed >= Number(component.expectedLifeKm) || (Number(component.expectedLifeDays ?? 0) > 0 && elapsedDays >= Number(component.expectedLifeDays)) ? "CRITICAL" : "HIGH";
    const lifecycleDetail = [dueByKm ? `${consumedPercent}% of odometer life consumed` : null, dueByDays ? `${elapsedPercent}% of time life elapsed` : null].filter(Boolean).join("; ");
    const workOrder = await fleetDb.workOrder.create({ data: { id: crypto.randomUUID(), orgId, vehicleId, title: `${component.name} service threshold reached`, description: `${component.name}: ${lifecycleDetail}.`, priority, status: "OPEN", createdAt: new Date() } });
    await notifyRoles(orgId, ["SUPERADMIN", "FLEET_MANAGER"], "Maintenance lifecycle alert", `${vehicleIdentity(vehicle)}: ${component.name} crossed its service threshold.`, "MAINTENANCE_THRESHOLD", workOrder.id);
    if (fleetDb.auditEvent?.create) await fleetDb.auditEvent.create({ data: { id: crypto.randomUUID(), orgId, actorId: null, action: "MAINTENANCE_THRESHOLD_TRIGGERED", entityType: "COMPONENT", entityId: component.id, summary: `Threshold triggered for ${component.name}`, metadata: JSON.stringify({ workOrderId: workOrder.id, serviceBaseline: Number(component.lastServicedOdometer), currentOdometer: Number(vehicle.currentOdometer), elapsedDays, expectedLifeKm: Number(component.expectedLifeKm), expectedLifeDays: Number(component.expectedLifeDays ?? 0), alertThresholdKm: Number(component.alertThresholdKm), alertThresholdDays: Number(component.alertThresholdDays ?? 0), dueByKm, dueByDays }), createdAt: new Date() } });
    createdWorkOrders += 1;
  }
  return { createdWorkOrders };
}

export async function evaluateLowInventory(orgId: string) {
  const allParts = await fleetDb.inventoryPart.findMany({ where: { orgId } });
  const lowStock = (allParts as any[]).filter((part) => Number(part.quantityOnHand) <= Number(part.minReorderLevel));
  if (!lowStock.length) return { lowStock: 0, draftPurchaseOrders: 0 };
  let draftPurchaseOrders = 0;
  let vendor = await fleetDb.vendor.findFirst({ where: { orgId, name: "VahanSync auto-reorder queue" } });
  if (!vendor) vendor = await fleetDb.vendor.create({ data: { id: crypto.randomUUID(), orgId, name: "VahanSync auto-reorder queue", phone: "SYSTEM", createdAt: new Date() } });
  for (const part of lowStock) {
    const alreadyNotified = await fleetDb.notification.findFirst({ where: { orgId, referenceId: part.id, type: "INVENTORY_LOW", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    if (alreadyNotified) continue;
    const suggestedQty = Math.max(Number(part.minReorderLevel) * 2 - Number(part.quantityOnHand), 1);
    const purchaseOrder = await fleetDb.purchaseOrder.create({ data: { id: crypto.randomUUID(), orgId, vendorId: vendor.id, status: "DRAFT", totalCost: suggestedQty * Number(part.unitCost), createdAt: new Date() } });
    await notifyRoles(orgId, ["SUPERADMIN", "INVENTORY_MANAGER"], "Inventory below reorder level", `${part.name} (${part.sku}) has ${part.quantityOnHand} units remaining. Draft PO created for ${suggestedQty} units.`, "INVENTORY_LOW", part.id);
    await notifyRoles(orgId, ["SUPERADMIN", "INVENTORY_MANAGER"], "Draft purchase order created", `Draft PO ${purchaseOrder.id.slice(0, 8).toUpperCase()} was created for ${part.name}.`, "PURCHASE_ORDER_DRAFT", purchaseOrder.id);
    draftPurchaseOrders += 1;
  }
  return { lowStock: lowStock.length, draftPurchaseOrders };
}

export async function evaluateDocumentExpiry(orgId: string) {
  const documents = await fleetDb.document.findMany({ where: { orgId } });
  const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiring = (documents as any[]).filter((document) => new Date(document.expiryDate).getTime() <= horizon.getTime());
  for (const document of expiring) {
    const alreadyNotified = await fleetDb.notification.findFirst({ where: { orgId, referenceId: document.id, type: "DOCUMENT_EXPIRY", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    if (alreadyNotified) continue;
    await notifyRoles(orgId, ["SUPERADMIN", "FLEET_MANAGER"], "Compliance document expiring", `${document.title} expires on ${new Date(document.expiryDate).toLocaleDateString("en-IN")}.`, "DOCUMENT_EXPIRY", document.id);
  }
  return { expiring: expiring.length };
}

export async function evaluateEscalations(orgId: string) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let escalated = 0;
  if (fleetDb.notification?.findMany) {
    const alerts = await fleetDb.notification.findMany({ where: { orgId, severity: "CRITICAL", acknowledgedAt: null, escalationLevel: 0, createdAt: { lte: cutoff } }, take: 100 });
    for (const alert of alerts as any[]) {
      if (fleetDb.notification.updateMany) await fleetDb.notification.updateMany({ where: { id: alert.id, orgId, escalationLevel: 0 }, data: { escalationLevel: 1, updatedAt: new Date() } });
      await notifyRoles(orgId, ["SUPERADMIN", "FLEET_MANAGER"], "Critical maintenance alert escalated", `${alert.title}: ${alert.message}`, "ALERT_ESCALATION", alert.referenceId ?? undefined);
      escalated += 1;
    }
  }
  if (fleetDb.workOrder?.findMany) {
    const overdueOrders = await fleetDb.workOrder.findMany({ where: { orgId, priority: "CRITICAL", status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_PARTS", "REWORK"] }, createdAt: { lte: cutoff } }, take: 100 });
    for (const order of overdueOrders as any[]) {
      const marker = fleetDb.notification?.findFirst ? await fleetDb.notification.findFirst({ where: { orgId, type: "WORK_ORDER_ESCALATION", referenceId: order.id } }) : null;
      if (marker) continue;
      await notifyRoles(orgId, ["SUPERADMIN", "FLEET_MANAGER"], "Critical work order overdue", `${order.title} remains ${order.status} after 24 hours.`, "WORK_ORDER_ESCALATION", order.id);
      escalated += 1;
    }
  }
  return escalated;
}

async function evaluateAllOrganizationsUnsafe() {
  if (fleetDb.idempotencyRecord?.deleteMany) {
    await fleetDb.idempotencyRecord.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
  const organizations = await fleetDb.organization.findMany({ select: { id: true } });
  let maintenanceOrders = 0;
  let lowStockParts = 0;
  let draftPurchaseOrders = 0;
  let expiringDocuments = 0;
  let escalatedAlerts = 0;
  for (const org of organizations as any[]) {
    const vehicles = await fleetDb.vehicle.findMany({ where: { orgId: org.id }, select: { id: true } });
    for (const vehicle of vehicles as any[]) maintenanceOrders += (await evaluateVehicleMaintenance(vehicle.id, org.id)).createdWorkOrders;
    const inventory = await evaluateLowInventory(org.id); lowStockParts += inventory.lowStock; draftPurchaseOrders += inventory.draftPurchaseOrders;
    expiringDocuments += (await evaluateDocumentExpiry(org.id)).expiring;
    escalatedAlerts += await evaluateEscalations(org.id);
  }
  return { organizations: organizations.length, maintenanceOrders, lowStockParts, draftPurchaseOrders, expiringDocuments, escalatedAlerts };
}

export async function evaluateAllOrganizations() {
  try {
    return await evaluateAllOrganizationsUnsafe();
  } catch (error) {
    logRequestSignal({ event: "automation_failure", requestId: "heartbeat", path: "evaluateAllOrganizations", message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
