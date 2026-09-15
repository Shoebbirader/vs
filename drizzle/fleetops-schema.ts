import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";

const audit = {
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    subscriptionTier: text("subscriptionTier").notNull(),
    trialEndsAt: timestamp("trialEndsAt", { withTimezone: true }).notNull(),
    subscriptionStartedAt: timestamp("subscriptionStartedAt", {
      withTimezone: true,
    }),
    renewalAt: timestamp("renewalAt", { withTimezone: true }),
    paymentFailedAt: timestamp("paymentFailedAt", { withTimezone: true }),
    billingStatus: text("billingStatus").notNull().default("TRIAL"),
    suspendedAt: timestamp("suspendedAt", { withTimezone: true }),
    maxVehicles: integer("maxVehicles").notNull(),
    maxUsers: integer("maxUsers").notNull(),
    currency: text("currency").notNull(),
    ...audit,
  },
  table => ({
    orgIdIdx: index("idx_organizations_id").on(table.id),
    tierIdx: index("idx_organizations_tier").on(table.subscriptionTier),
  })
);
export const organizationSettings = pgTable(
  "organization_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    odometerMaxDailyKm: integer("odometerMaxDailyKm").notNull().default(1000),
    laborRatePerHour: numeric("laborRatePerHour").notNull().default("0"),
    safetyContactName: text("safetyContactName"),
    safetyContactPhone: text("safetyContactPhone"),
    ...audit,
  },
  table => ({ orgIdIdx: index("idx_org_settings_orgId").on(table.orgId) })
);
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: uuid("authUserId").notNull(),
    orgId: uuid("orgId").notNull(),
    email: text("email").notNull(),
    fullName: text("fullName").notNull(),
    role: text("role").notNull(),
    mobileNumber: text("mobileNumber"),
    smsAlertsEnabled: boolean("smsAlertsEnabled").notNull().default(false),
    whatsappAlertsEnabled: boolean("whatsappAlertsEnabled")
      .notNull()
      .default(false),
    smsOptedInAt: timestamp("smsOptedInAt", { withTimezone: true }),
    whatsappOptedInAt: timestamp("whatsappOptedInAt", { withTimezone: true }),
    ...audit,
  },
  table => ({
    orgIdIdx: index("idx_users_orgId").on(table.orgId),
    authUserIdIdx: index("idx_users_authUserId").on(table.authUserId),
    emailIdx: index("idx_users_email").on(table.email),
  })
);
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("tokenHash").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("acceptedAt", { withTimezone: true }),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    revokedById: uuid("revokedById"),
    resendCount: integer("resendCount").notNull().default(0),
    lastSentAt: timestamp("lastSentAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    orgIdIdx: index("idx_invitations_orgId").on(table.orgId),
    tokenIdx: index("idx_invitations_token").on(table.tokenHash),
  })
);
export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    vin: text("vin").notNull(),
    licensePlate: text("licensePlate").notNull(),
    chassisNumber: text("chassisNumber"),
    engineNumber: text("engineNumber"),
    vehicleType: text("vehicleType"),
    assignedRoute: text("assignedRoute"),
    depotLocation: text("depotLocation"),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year").notNull(),
    currentOdometer: numeric("currentOdometer").notNull(),
    status: text("status").notNull(),
    ...audit,
  },
  table => ({
    orgIdIdx: index("idx_vehicles_orgId").on(table.orgId),
    statusIdx: index("idx_vehicles_status").on(table.status),
  })
);
export const vehicleAssignments = pgTable(
  "vehicle_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    vehicleId: uuid("vehicleId").notNull(),
    driverId: uuid("driverId").notNull(),
    active: boolean("active").notNull().default(true),
    ...audit,
  },
  table => ({
    orgIdIdx: index("idx_vehicle_assignments_orgId").on(table.orgId),
    vehicleIdIdx: index("idx_vehicle_assignments_vehicleId").on(
      table.vehicleId
    ),
    driverIdIdx: index("idx_vehicle_assignments_driverId").on(table.driverId),
    activeDriverUnique: uniqueIndex("uq_active_assignment_org_driver")
      .on(table.orgId, table.driverId)
      .where(sql`"active" = true`),
    activeVehicleUnique: uniqueIndex("uq_active_assignment_org_vehicle")
      .on(table.orgId, table.vehicleId)
      .where(sql`"active" = true`),
  })
);
export const components = pgTable(
  "components",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleId: uuid("vehicleId").notNull(),
    inventoryPartId: uuid("inventoryPartId"),
    name: text("name").notNull(),
    componentType: text("componentType").notNull().default("OTHER"),
    componentSubtype: text("componentSubtype"),
    brand: text("brand"),
    partNumber: text("partNumber"),
    serialNumber: text("serialNumber"),
    installationDate: timestamp("installationDate", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expectedLifeKm: numeric("expectedLifeKm").notNull(),
    expectedLifeDays: integer("expectedLifeDays"),
    lastServicedOdometer: numeric("lastServicedOdometer").notNull(),
    alertThresholdKm: numeric("alertThresholdKm").notNull(),
    alertThresholdDays: integer("alertThresholdDays"),
    notes: text("notes"),
    status: text("status").notNull().default("ACTIVE"),
  },
  table => ({
    vehicleIdIdx: index("idx_components_vehicleId").on(table.vehicleId),
  })
);
export const odometerLogs = pgTable(
  "odometer_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleId: uuid("vehicleId").notNull(),
    driverId: uuid("driverId"),
    reading: numeric("reading").notNull(),
    source: text("source").notNull(),
    isFlagged: boolean("isFlagged").notNull(),
    ...audit,
  },
  table => ({
    vehicleIdIdx: index("idx_odometer_logs_vehicleId").on(table.vehicleId),
    driverIdIdx: index("idx_odometer_logs_driverId").on(table.driverId),
  })
);
export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    vehicleId: uuid("vehicleId").notNull(),
    assignedMechanicId: uuid("assignedMechanicId"),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    scheduledFor: timestamp("scheduledFor", { withTimezone: true }),
    archivedAt: timestamp("archivedAt", { withTimezone: true }),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    laborHours: numeric("laborHours"),
    repairNotes: text("repairNotes"),
    ...audit,
  },
  table => ({
    orgIdIdx: index("idx_work_orders_orgId").on(table.orgId),
    vehicleIdIdx: index("idx_work_orders_vehicleId").on(table.vehicleId),
    statusIdx: index("idx_work_orders_status").on(table.status),
  })
);
export const workOrderEvidence = pgTable(
  "work_order_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    workOrderId: uuid("workOrderId").notNull(),
    uploadedById: uuid("uploadedById").notNull(),
    fileUrl: text("fileUrl").notNull(),
    fileKey: text("fileKey"),
    caption: text("caption"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    workOrderIdIdx: index("idx_work_order_evidence_workOrderId").on(
      table.workOrderId
    ),
  })
);
export const inventoryParts = pgTable(
  "inventory_parts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    binLocation: text("binLocation"),
    quantityOnHand: integer("quantityOnHand").notNull(),
    minReorderLevel: integer("minReorderLevel").notNull(),
    unitCost: numeric("unitCost").notNull(),
  },
  table => ({
    orgIdIdx: index("idx_inventory_parts_orgId").on(table.orgId),
    skuIdx: index("idx_inventory_parts_sku").on(table.sku),
  })
);
export const workOrderParts = pgTable(
  "work_order_parts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workOrderId: uuid("workOrderId").notNull(),
    partId: uuid("partId").notNull(),
    qtyUsed: integer("qtyUsed").notNull(),
    unitPrice: numeric("unitPrice").notNull(),
  },
  table => ({
    workOrderIdIdx: index("idx_work_order_parts_workOrderId").on(
      table.workOrderId
    ),
  })
);
// prettier-ignore
export const vendors = pgTable( // createdAt: timestamp("createdAt"
  "vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    name: text("name").notNull(),
    contactPerson: text("contactPerson"),
    phone: text("phone").notNull(),
    email: text("email"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({ orgIdIdx: index("idx_vendors_orgId").on(table.orgId) })
);
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    vendorId: uuid("vendorId").notNull(),
    status: text("status").notNull(),
    totalCost: numeric("totalCost").notNull(),
    supplierInvoiceNumber: text("supplierInvoiceNumber"),
    receivedAt: timestamp("receivedAt", { withTimezone: true }),
    closedAt: timestamp("closedAt", { withTimezone: true }),
    ...audit,
  },
  table => ({ orgIdIdx: index("idx_purchase_orders_orgId").on(table.orgId) })
);
export const purchaseOrderReceipts = pgTable(
  "purchase_order_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    purchaseOrderId: uuid("purchaseOrderId").notNull(),
    partId: uuid("partId").notNull(),
    quantity: integer("quantity").notNull(),
    damagedQuantity: integer("damagedQuantity").notNull().default(0),
    backorderedQuantity: integer("backorderedQuantity").notNull().default(0),
    varianceReason: text("varianceReason"),
    unitCost: numeric("unitCost").notNull(),
    invoiceNumber: text("invoiceNumber"),
    location: text("location"),
    receivedById: uuid("receivedById").notNull(),
    receivedAt: timestamp("receivedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    purchaseOrderIdIdx: index("idx_purchase_order_receipts_poId").on(
      table.purchaseOrderId
    ),
  })
);
export const financialRecords = pgTable(
  "financial_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    vehicleId: uuid("vehicleId").notNull(),
    type: text("type").notNull(),
    category: text("category").notNull(),
    amount: numeric("amount").notNull(),
    transactionDate: timestamp("transactionDate", {
      withTimezone: true,
    }).notNull(),
    taxAmount: numeric("taxAmount").notNull().default("0"),
    gstin: text("gstin"),
    taxCategory: text("taxCategory"),
    invoiceNumber: text("invoiceNumber"),
    vendor: text("vendor"),
    paymentMethod: text("paymentMethod"),
    costCenterType: text("costCenterType"),
    costCenterId: uuid("costCenterId"),
    tdsAmount: numeric("tdsAmount").notNull().default("0"),
    reconciledAt: timestamp("reconciledAt", { withTimezone: true }),
    reconciliationRef: text("reconciliationRef"),
    approvalStatus: text("approvalStatus").notNull().default("APPROVED"),
    approvedById: uuid("approvedById"),
    approvalReason: text("approvalReason"),
    reversalOfId: uuid("reversalOfId"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    orgIdIdx: index("idx_financial_records_orgId").on(table.orgId),
    vehicleIdIdx: index("idx_financial_records_vehicleId").on(table.vehicleId),
  })
);
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    vehicleId: uuid("vehicleId"),
    title: text("title").notNull(),
    docType: text("docType").notNull(),
    fileUrl: text("fileUrl").notNull(),
    fileKey: text("fileKey"),
    fileChecksum: text("fileChecksum"),
    fileSizeBytes: integer("fileSizeBytes"),
    retentionUntil: timestamp("retentionUntil", { withTimezone: true }),
    expiryDate: timestamp("expiryDate", { withTimezone: true }).notNull(),
    archivedAt: timestamp("archivedAt", { withTimezone: true }),
    archivedById: uuid("archivedById"),
    ...audit,
  },
  table => ({
    orgIdIdx: index("idx_documents_orgId").on(table.orgId),
    expiryDateIdx: index("idx_documents_expiryDate").on(table.expiryDate),
  })
);
export const storageCleanupJobs = pgTable(
  "storage_cleanup_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    bucket: text("bucket").notNull(),
    fileKey: text("fileKey").notNull(),
    reason: text("reason").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("nextAttemptAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    orgIdIdx: index("idx_storage_cleanup_jobs_orgId").on(table.orgId),
    pendingIdx: index("idx_storage_cleanup_jobs_pending").on(
      table.nextAttemptAt
    ),
  })
);
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    documentId: uuid("documentId").notNull(),
    versionNumber: integer("versionNumber").notNull(),
    title: text("title").notNull(),
    docType: text("docType").notNull(),
    fileUrl: text("fileUrl").notNull(),
    fileKey: text("fileKey"),
    fileChecksum: text("fileChecksum"),
    fileSizeBytes: integer("fileSizeBytes"),
    expiryDate: timestamp("expiryDate", { withTimezone: true }).notNull(),
    createdById: uuid("createdById").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    documentIdIdx: index("idx_document_versions_documentId").on(
      table.documentId
    ),
  })
);
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    recipientId: uuid("recipientId").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("INFO"),
    sourceType: text("sourceType").notNull().default("SYSTEM"),
    dedupeKey: text("dedupeKey"),
    referenceId: uuid("referenceId"),
    isRead: boolean("isRead").notNull(),
    acknowledgedAt: timestamp("acknowledgedAt", { withTimezone: true }),
    escalationLevel: integer("escalationLevel").notNull().default(0),
    resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
    ...audit,
  },
  table => ({
    recipientIdIdx: index("idx_notifications_recipientId").on(
      table.recipientId
    ),
  })
);
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    notificationId: uuid("notificationId").notNull(),
    recipientId: uuid("recipientId").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    providerMessageId: text("providerMessageId"),
    errorCode: text("errorCode"),
    errorMessage: text("errorMessage"),
    attempt: integer("attempt").notNull().default(1),
    contentSid: text("contentSid"),
    sentAt: timestamp("sentAt", { withTimezone: true }),
    deliveredAt: timestamp("deliveredAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    notificationIdIdx: index("idx_notification_deliveries_notificationId").on(
      table.notificationId
    ),
  })
);
export const vehicleIssues = pgTable(
  "vehicle_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    vehicleId: uuid("vehicleId").notNull(),
    driverId: uuid("driverId").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    photoUrl: text("photoUrl"),
    photoKey: text("photoKey"),
    ...audit,
  },
  table => ({
    orgIdIdx: index("idx_vehicle_issues_orgId").on(table.orgId),
    vehicleIdIdx: index("idx_vehicle_issues_vehicleId").on(table.vehicleId),
  })
);
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    actorId: uuid("actorId"),
    actorRole: text("actorRole"),
    action: text("action").notNull(),
    entityType: text("entityType").notNull(),
    entityId: uuid("entityId"),
    summary: text("summary").notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    orgIdIdx: index("idx_audit_events_orgId").on(table.orgId),
    actionIdx: index("idx_audit_events_action").on(table.action),
  })
);
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    partId: uuid("partId").notNull(),
    workOrderId: uuid("workOrderId"),
    actorId: uuid("actorId"),
    movementType: text("movementType").notNull(),
    quantity: integer("quantity").notNull(),
    unitCost: numeric("unitCost").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    partIdIdx: index("idx_inventory_movements_partId").on(table.partId),
    workOrderIdIdx: index("idx_inventory_movements_workOrderId").on(
      table.workOrderId
    ),
  })
);
export const billingInvoices = pgTable(
  "billing_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    billingPeriodStart: timestamp("billingPeriodStart", {
      withTimezone: true,
    }).notNull(),
    billingPeriodEnd: timestamp("billingPeriodEnd", {
      withTimezone: true,
    }).notNull(),
    plan: text("plan").notNull(),
    billableVehicles: integer("billableVehicles").notNull(),
    includedVehicles: integer("includedVehicles").notNull(),
    overageVehicles: integer("overageVehicles").notNull(),
    platformFeePaise: integer("platformFeePaise").notNull(),
    overagePaise: integer("overagePaise").notNull(),
    usageAddonsPaise: integer("usageAddonsPaise").notNull().default(0),
    creditsPaise: integer("creditsPaise").notNull().default(0),
    subtotalPaise: integer("subtotalPaise").notNull(),
    taxPaise: integer("taxPaise").notNull().default(0),
    totalPaise: integer("totalPaise").notNull(),
    status: text("status").notNull().default("DRAFT"),
    externalInvoiceId: text("externalInvoiceId"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    orgIdIdx: index("idx_billing_invoices_orgId").on(table.orgId),
    periodUnique: uniqueIndex("uq_billing_invoices_org_period").on(
      table.orgId,
      table.billingPeriodStart
    ),
  })
);
export const billingPayments = pgTable(
  "billing_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    invoiceId: uuid("invoiceId").notNull(),
    provider: text("provider").notNull().default("RAZORPAY"),
    providerPaymentId: text("providerPaymentId"),
    status: text("status").notNull(),
    amountPaise: integer("amountPaise").notNull(),
    paidAt: timestamp("paidAt", { withTimezone: true }),
    failureReason: text("failureReason"),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    orgIdIdx: index("idx_billing_payments_orgId").on(table.orgId),
    invoiceIdIdx: index("idx_billing_payments_invoiceId").on(table.invoiceId),
  })
);

export const dvirInspections = pgTable(
  "dvir_inspections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    vehicleId: uuid("vehicleId").notNull(),
    driverId: uuid("driverId").notNull(),
    inspectionType: text("inspectionType").notNull(),
    status: text("status").notNull(),
    notes: text("notes"),
    photoUrl: text("photoUrl"),
    photoKey: text("photoKey"),
    ...audit,
  },
  table => ({
    orgIdIdx: index("idx_dvir_inspections_orgId").on(table.orgId),
    vehicleIdIdx: index("idx_dvir_inspections_vehicleId").on(table.vehicleId),
  })
);
export const fuelLogs = pgTable(
  "fuel_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    vehicleId: uuid("vehicleId").notNull(),
    driverId: uuid("driverId").notNull(),
    liters: numeric("liters").notNull(),
    amount: numeric("amount").notNull(),
    odometer: numeric("odometer").notNull(),
    station: text("station"),
    receiptUrl: text("receiptUrl"),
    ...audit,
  },
  table => ({
    orgIdIdx: index("idx_fuel_logs_orgId").on(table.orgId),
    vehicleIdIdx: index("idx_fuel_logs_vehicleId").on(table.vehicleId),
  })
);
export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("orgId").notNull(),
    userId: uuid("userId").notNull(),
    idempotencyKey: text("idempotencyKey").notNull(),
    procedure: text("procedure").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    scopeIdx: index("idx_idempotency_records_scope").on(
      table.orgId,
      table.userId,
      table.idempotencyKey
    ),
    procedureIdx: index("idx_idempotency_records_procedure").on(
      table.procedure
    ),
    scopeUnique: uniqueIndex("uq_idempotency_records_scope").on(
      table.orgId,
      table.userId,
      table.idempotencyKey,
      table.procedure
    ),
  })
);
