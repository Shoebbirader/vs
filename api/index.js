var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path2 from "node:path";
import { defineConfig } from "vite";
var vite_config_default;
var init_vite_config = __esm({
  "vite.config.ts"() {
    "use strict";
    vite_config_default = defineConfig({
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          "@": path2.resolve(import.meta.dirname, "client", "src"),
          "@shared": path2.resolve(import.meta.dirname, "shared"),
          "@assets": path2.resolve(import.meta.dirname, "attached_assets")
        }
      },
      envDir: path2.resolve(import.meta.dirname),
      root: path2.resolve(import.meta.dirname, "client"),
      publicDir: path2.resolve(import.meta.dirname, "client", "public"),
      build: {
        outDir: path2.resolve(import.meta.dirname, "dist/public"),
        emptyOutDir: true
      },
      server: {
        host: true,
        allowedHosts: ["localhost", "127.0.0.1"],
        fs: {
          strict: true,
          deny: ["**/.*"]
        }
      }
    });
  }
});

// server/_core/vite.ts
var vite_exports = {};
__export(vite_exports, {
  serveStatic: () => serveStatic2,
  setupVite: () => setupVite
});
import express2 from "express";
import fs2 from "fs";
import { randomUUID as randomUUID2 } from "node:crypto";
import path3 from "path";
import { createServer as createViteServer } from "vite";
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${randomUUID2()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic2(app) {
  const distPath = process.env.NODE_ENV === "development" ? path3.resolve(import.meta.dirname, "../..", "dist", "public") : path3.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express2.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}
var init_vite = __esm({
  "server/_core/vite.ts"() {
    "use strict";
    init_vite_config();
  }
});

// server/_core/index.ts
import "dotenv/config";
import express3 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { createHash } from "node:crypto";
import { z as z2 } from "zod";

// server/profile-validation.ts
function isIndianE164Mobile(value) {
  return /^\+91[6-9]\d{9}$/.test(value.trim());
}
function normalizeIndianE164Mobile(value) {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return null;
  if (!isIndianE164Mobile(normalized)) throw new Error("Use an Indian mobile number in +91XXXXXXXXXX format.");
  return normalized;
}

// shared/const.ts
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var requireFleetOpsUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.fleetopsUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Supabase authentication required" });
  }
  return next({ ctx: { ...ctx, fleetopsUser: ctx.fleetopsUser } });
});
var fleetOpsProcedure = t.procedure.use(requireFleetOpsUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
import { randomUUID } from "node:crypto";
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError as TRPCError2 } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var validatePayload = (input) => {
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new TRPCError2({ code: "BAD_REQUEST", message: "Notification title is required." });
  }
  if (typeof input.content !== "string" || !input.content.trim()) {
    throw new TRPCError2({ code: "BAD_REQUEST", message: "Notification content is required." });
  }
  const title = input.title.trim();
  const content = input.content.trim();
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError2({ code: "BAD_REQUEST", message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.` });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError2({ code: "BAD_REQUEST", message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.` });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const validated = validatePayload(payload);
  console.info(`[FleetOps notification] ${validated.title}: ${validated.content}`);
  return true;
}

// server/_core/systemRouter.ts
import { sql as sql2 } from "drizzle-orm";

// server/db.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

// drizzle/fleetops-schema.ts
import { boolean, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
var audit = { createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull() };
var organizations = pgTable("organizations", { id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), subscriptionTier: text("subscriptionTier").notNull(), trialEndsAt: timestamp("trialEndsAt", { withTimezone: true }).notNull(), subscriptionStartedAt: timestamp("subscriptionStartedAt", { withTimezone: true }), renewalAt: timestamp("renewalAt", { withTimezone: true }), paymentFailedAt: timestamp("paymentFailedAt", { withTimezone: true }), billingStatus: text("billingStatus").notNull().default("TRIAL"), suspendedAt: timestamp("suspendedAt", { withTimezone: true }), maxVehicles: integer("maxVehicles").notNull(), maxUsers: integer("maxUsers").notNull(), currency: text("currency").notNull(), ...audit });
var organizationSettings = pgTable("organization_settings", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), timezone: text("timezone").notNull().default("Asia/Kolkata"), odometerMaxDailyKm: integer("odometerMaxDailyKm").notNull().default(1e3), laborRatePerHour: numeric("laborRatePerHour").notNull().default("0"), safetyContactName: text("safetyContactName"), safetyContactPhone: text("safetyContactPhone"), ...audit });
var users = pgTable("users", { id: uuid("id").defaultRandom().primaryKey(), authUserId: uuid("authUserId").notNull(), orgId: uuid("orgId").notNull(), email: text("email").notNull(), fullName: text("fullName").notNull(), role: text("role").notNull(), mobileNumber: text("mobileNumber"), smsAlertsEnabled: boolean("smsAlertsEnabled").notNull().default(false), whatsappAlertsEnabled: boolean("whatsappAlertsEnabled").notNull().default(false), smsOptedInAt: timestamp("smsOptedInAt", { withTimezone: true }), whatsappOptedInAt: timestamp("whatsappOptedInAt", { withTimezone: true }), ...audit });
var invitations = pgTable("invitations", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), email: text("email").notNull(), role: text("role").notNull(), tokenHash: text("tokenHash").notNull(), expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(), acceptedAt: timestamp("acceptedAt", { withTimezone: true }), revokedAt: timestamp("revokedAt", { withTimezone: true }), revokedById: uuid("revokedById"), resendCount: integer("resendCount").notNull().default(0), lastSentAt: timestamp("lastSentAt", { withTimezone: true }), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull() });
var vehicles = pgTable("vehicles", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), vin: text("vin").notNull(), licensePlate: text("licensePlate").notNull(), chassisNumber: text("chassisNumber"), engineNumber: text("engineNumber"), vehicleType: text("vehicleType"), assignedRoute: text("assignedRoute"), depotLocation: text("depotLocation"), make: text("make").notNull(), model: text("model").notNull(), year: integer("year").notNull(), currentOdometer: numeric("currentOdometer").notNull(), status: text("status").notNull(), ...audit });
var vehicleAssignments = pgTable("vehicle_assignments", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), vehicleId: uuid("vehicleId").notNull(), driverId: uuid("driverId").notNull(), active: boolean("active").notNull().default(true), ...audit });
var components = pgTable("components", { id: uuid("id").defaultRandom().primaryKey(), vehicleId: uuid("vehicleId").notNull(), inventoryPartId: uuid("inventoryPartId"), name: text("name").notNull(), componentType: text("componentType").notNull().default("OTHER"), componentSubtype: text("componentSubtype"), brand: text("brand"), partNumber: text("partNumber"), serialNumber: text("serialNumber"), installationDate: timestamp("installationDate", { withTimezone: true }).notNull().defaultNow(), expectedLifeKm: numeric("expectedLifeKm").notNull(), expectedLifeDays: integer("expectedLifeDays"), lastServicedOdometer: numeric("lastServicedOdometer").notNull(), alertThresholdKm: numeric("alertThresholdKm").notNull(), alertThresholdDays: integer("alertThresholdDays"), notes: text("notes"), status: text("status").notNull().default("ACTIVE") });
var odometerLogs = pgTable("odometer_logs", { id: uuid("id").defaultRandom().primaryKey(), vehicleId: uuid("vehicleId").notNull(), driverId: uuid("driverId"), reading: numeric("reading").notNull(), source: text("source").notNull(), isFlagged: boolean("isFlagged").notNull(), ...audit });
var workOrders = pgTable("work_orders", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), vehicleId: uuid("vehicleId").notNull(), assignedMechanicId: uuid("assignedMechanicId"), title: text("title").notNull(), description: text("description"), priority: text("priority").notNull(), status: text("status").notNull(), scheduledFor: timestamp("scheduledFor", { withTimezone: true }), archivedAt: timestamp("archivedAt", { withTimezone: true }), startedAt: timestamp("startedAt", { withTimezone: true }), completedAt: timestamp("completedAt", { withTimezone: true }), laborHours: numeric("laborHours"), repairNotes: text("repairNotes"), ...audit });
var workOrderEvidence = pgTable("work_order_evidence", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), workOrderId: uuid("workOrderId").notNull(), uploadedById: uuid("uploadedById").notNull(), fileUrl: text("fileUrl").notNull(), fileKey: text("fileKey"), caption: text("caption"), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull() });
var inventoryParts = pgTable("inventory_parts", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), sku: text("sku").notNull(), name: text("name").notNull(), binLocation: text("binLocation"), quantityOnHand: integer("quantityOnHand").notNull(), minReorderLevel: integer("minReorderLevel").notNull(), unitCost: numeric("unitCost").notNull() });
var workOrderParts = pgTable("work_order_parts", { id: uuid("id").defaultRandom().primaryKey(), workOrderId: uuid("workOrderId").notNull(), partId: uuid("partId").notNull(), qtyUsed: integer("qtyUsed").notNull(), unitPrice: numeric("unitPrice").notNull() });
var vendors = pgTable("vendors", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), name: text("name").notNull(), contactPerson: text("contactPerson"), phone: text("phone").notNull(), email: text("email"), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull() });
var purchaseOrders = pgTable("purchase_orders", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), vendorId: uuid("vendorId").notNull(), status: text("status").notNull(), totalCost: numeric("totalCost").notNull(), supplierInvoiceNumber: text("supplierInvoiceNumber"), receivedAt: timestamp("receivedAt", { withTimezone: true }), closedAt: timestamp("closedAt", { withTimezone: true }), ...audit });
var purchaseOrderReceipts = pgTable("purchase_order_receipts", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), purchaseOrderId: uuid("purchaseOrderId").notNull(), partId: uuid("partId").notNull(), quantity: integer("quantity").notNull(), damagedQuantity: integer("damagedQuantity").notNull().default(0), backorderedQuantity: integer("backorderedQuantity").notNull().default(0), varianceReason: text("varianceReason"), unitCost: numeric("unitCost").notNull(), invoiceNumber: text("invoiceNumber"), location: text("location"), receivedById: uuid("receivedById").notNull(), receivedAt: timestamp("receivedAt", { withTimezone: true }).defaultNow().notNull() });
var financialRecords = pgTable("financial_records", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), vehicleId: uuid("vehicleId").notNull(), type: text("type").notNull(), category: text("category").notNull(), amount: numeric("amount").notNull(), transactionDate: timestamp("transactionDate", { withTimezone: true }).notNull(), taxAmount: numeric("taxAmount").notNull().default("0"), gstin: text("gstin"), taxCategory: text("taxCategory"), invoiceNumber: text("invoiceNumber"), vendor: text("vendor"), paymentMethod: text("paymentMethod"), costCenterType: text("costCenterType"), costCenterId: uuid("costCenterId"), tdsAmount: numeric("tdsAmount").notNull().default("0"), reconciledAt: timestamp("reconciledAt", { withTimezone: true }), reconciliationRef: text("reconciliationRef"), approvalStatus: text("approvalStatus").notNull().default("APPROVED"), approvedById: uuid("approvedById"), approvalReason: text("approvalReason"), reversalOfId: uuid("reversalOfId"), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull() });
var documents = pgTable("documents", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), vehicleId: uuid("vehicleId"), title: text("title").notNull(), docType: text("docType").notNull(), fileUrl: text("fileUrl").notNull(), fileKey: text("fileKey"), fileChecksum: text("fileChecksum"), fileSizeBytes: integer("fileSizeBytes"), retentionUntil: timestamp("retentionUntil", { withTimezone: true }), expiryDate: timestamp("expiryDate", { withTimezone: true }).notNull(), archivedAt: timestamp("archivedAt", { withTimezone: true }), archivedById: uuid("archivedById"), ...audit });
var documentVersions = pgTable("document_versions", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), documentId: uuid("documentId").notNull(), versionNumber: integer("versionNumber").notNull(), title: text("title").notNull(), docType: text("docType").notNull(), fileUrl: text("fileUrl").notNull(), fileKey: text("fileKey"), fileChecksum: text("fileChecksum"), fileSizeBytes: integer("fileSizeBytes"), expiryDate: timestamp("expiryDate", { withTimezone: true }).notNull(), createdById: uuid("createdById").notNull(), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull() });
var notifications = pgTable("notifications", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), recipientId: uuid("recipientId").notNull(), title: text("title").notNull(), message: text("message").notNull(), type: text("type").notNull(), severity: text("severity").notNull().default("INFO"), sourceType: text("sourceType").notNull().default("SYSTEM"), dedupeKey: text("dedupeKey"), referenceId: uuid("referenceId"), isRead: boolean("isRead").notNull(), acknowledgedAt: timestamp("acknowledgedAt", { withTimezone: true }), escalationLevel: integer("escalationLevel").notNull().default(0), resolvedAt: timestamp("resolvedAt", { withTimezone: true }), ...audit });
var notificationDeliveries = pgTable("notification_deliveries", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), notificationId: uuid("notificationId").notNull(), recipientId: uuid("recipientId").notNull(), channel: text("channel").notNull(), status: text("status").notNull(), providerMessageId: text("providerMessageId"), errorCode: text("errorCode"), errorMessage: text("errorMessage"), attempt: integer("attempt").notNull().default(1), contentSid: text("contentSid"), sentAt: timestamp("sentAt", { withTimezone: true }), deliveredAt: timestamp("deliveredAt", { withTimezone: true }), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull() });
var vehicleIssues = pgTable("vehicle_issues", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), vehicleId: uuid("vehicleId").notNull(), driverId: uuid("driverId").notNull(), title: text("title").notNull(), description: text("description").notNull(), priority: text("priority").notNull(), status: text("status").notNull(), photoUrl: text("photoUrl"), photoKey: text("photoKey"), ...audit });
var auditEvents = pgTable("audit_events", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), actorId: uuid("actorId"), actorRole: text("actorRole"), action: text("action").notNull(), entityType: text("entityType").notNull(), entityId: uuid("entityId"), summary: text("summary").notNull(), metadata: text("metadata"), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull() });
var inventoryMovements = pgTable("inventory_movements", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), partId: uuid("partId").notNull(), workOrderId: uuid("workOrderId"), actorId: uuid("actorId"), movementType: text("movementType").notNull(), quantity: integer("quantity").notNull(), unitCost: numeric("unitCost").notNull(), reason: text("reason").notNull(), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull() });
var billingInvoices = pgTable("billing_invoices", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), billingPeriodStart: timestamp("billingPeriodStart", { withTimezone: true }).notNull(), billingPeriodEnd: timestamp("billingPeriodEnd", { withTimezone: true }).notNull(), plan: text("plan").notNull(), billableVehicles: integer("billableVehicles").notNull(), includedVehicles: integer("includedVehicles").notNull(), overageVehicles: integer("overageVehicles").notNull(), platformFeePaise: integer("platformFeePaise").notNull(), overagePaise: integer("overagePaise").notNull(), usageAddonsPaise: integer("usageAddonsPaise").notNull().default(0), creditsPaise: integer("creditsPaise").notNull().default(0), subtotalPaise: integer("subtotalPaise").notNull(), taxPaise: integer("taxPaise").notNull().default(0), totalPaise: integer("totalPaise").notNull(), status: text("status").notNull().default("DRAFT"), externalInvoiceId: text("externalInvoiceId"), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull() });
var billingPayments = pgTable("billing_payments", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), invoiceId: uuid("invoiceId").notNull(), provider: text("provider").notNull().default("RAZORPAY"), providerPaymentId: text("providerPaymentId"), status: text("status").notNull(), amountPaise: integer("amountPaise").notNull(), paidAt: timestamp("paidAt", { withTimezone: true }), failureReason: text("failureReason"), metadata: text("metadata"), createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull() });
var dvirInspections = pgTable("dvir_inspections", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), vehicleId: uuid("vehicleId").notNull(), driverId: uuid("driverId").notNull(), inspectionType: text("inspectionType").notNull(), status: text("status").notNull(), notes: text("notes"), photoUrl: text("photoUrl"), photoKey: text("photoKey"), ...audit });
var fuelLogs = pgTable("fuel_logs", { id: uuid("id").defaultRandom().primaryKey(), orgId: uuid("orgId").notNull(), vehicleId: uuid("vehicleId").notNull(), driverId: uuid("driverId").notNull(), liters: numeric("liters").notNull(), amount: numeric("amount").notNull(), odometer: numeric("odometer").notNull(), station: text("station"), receiptUrl: text("receiptUrl"), ...audit });

// server/db.ts
var globalForDb = globalThis;
var pool = globalForDb.fleetopsPool ?? new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, max: 5, ssl: { rejectUnauthorized: false } });
if (process.env.NODE_ENV !== "production") globalForDb.fleetopsPool = pool;
var db = globalForDb.fleetopsDb ?? drizzle(pool);
if (process.env.NODE_ENV !== "production") globalForDb.fleetopsDb = db;
var tables = {
  organization: "organizations",
  organizationSetting: "organization_settings",
  user: "users",
  invitation: "invitations",
  vehicle: "vehicles",
  vehicleAssignment: "vehicle_assignments",
  component: "components",
  odometerLog: "odometer_logs",
  workOrder: "work_orders",
  inventoryPart: "inventory_parts",
  workOrderPart: "work_order_parts",
  vendor: "vendors",
  purchaseOrder: "purchase_orders",
  purchaseOrderReceipt: "purchase_order_receipts",
  financialRecord: "financial_records",
  document: "documents",
  documentVersion: "document_versions",
  notification: "notifications",
  notificationDelivery: "notification_deliveries",
  workOrderEvidence: "work_order_evidence",
  vehicleIssue: "vehicle_issues",
  dvirInspection: "dvir_inspections",
  fuelLog: "fuel_logs",
  auditEvent: "audit_events",
  inventoryMovement: "inventory_movements",
  billingInvoice: "billing_invoices",
  billingPayment: "billing_payments"
};
function quote(name) {
  return `"${name.replace(/[^a-zA-Z0-9_]/g, "")}"`;
}
function normalize(value) {
  return value instanceof Date ? value.toISOString() : value;
}
function condition(field, value) {
  const c = quote(field);
  if (value === null) return `${c} IS NULL`;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value;
    if (o.in) return o.in.length ? `${c} IN (${o.in.map((v) => `'${String(v).replaceAll("'", "''")}'`).join(",")})` : "FALSE";
    if (o.notIn) return `${c} NOT IN (${o.notIn.map((v) => `'${String(v).replaceAll("'", "''")}'`).join(",")})`;
    if (o.contains !== void 0) return `${c} ILIKE '%${String(o.contains).replaceAll("'", "''")}%'`;
    if (o.gt !== void 0) return `${c} > '${String(normalize(o.gt)).replaceAll("'", "''")}'`;
    if (o.gte !== void 0) return `${c} >= '${String(normalize(o.gte)).replaceAll("'", "''")}'`;
    if (o.lt !== void 0) return `${c} < '${String(normalize(o.lt)).replaceAll("'", "''")}'`;
    if (o.lte !== void 0) return `${c} <= '${String(normalize(o.lte)).replaceAll("'", "''")}'`;
  }
  if (typeof value === "boolean") return `${c} = ${value}`;
  if (typeof value === "number") return `${c} = ${value}`;
  return `${c} = '${String(normalize(value)).replaceAll("'", "''")}'`;
}
function whereClause(where = {}) {
  const parts = [];
  for (const [field, value] of Object.entries(where)) {
    if (field === "vehicle" && value?.orgId) parts.push(`"vehicleId" IN (SELECT "id" FROM "vehicles" WHERE "orgId" = '${String(value.orgId).replaceAll("'", "''")}')`);
    else if (field === "org" && value?.id) parts.push(`"orgId" = '${String(value.id).replaceAll("'", "''")}'`);
    else if (field !== "vehicle" && field !== "org") parts.push(condition(field, value));
  }
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}
function dataColumns(data) {
  return Object.keys(data).filter((key) => !["vehicle", "org", "components", "workOrders", "assignedMechanic", "partsUsed"].includes(key));
}
var auditedTables = /* @__PURE__ */ new Set(["organizations", "users", "vehicles", "vehicle_assignments", "odometer_logs", "vendors", "purchase_orders", "notifications", "dvir_inspections", "fuel_logs"]);
function valueSql(value) {
  if (value === null || value === void 0) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  return `'${String(normalize(value)).replaceAll("'", "''")}'`;
}
function model(modelName) {
  const table = tables[modelName];
  return {
    async findMany(options = {}) {
      const select = options.select ? Object.keys(options.select).map(quote).join(", ") : "*";
      const order = options.orderBy ? Object.entries(options.orderBy).map(([k, v]) => `${quote(k)} ${String(v).toUpperCase()}`).join(", ") : void 0;
      const limit = options.take ? ` LIMIT ${Number(options.take)}` : "";
      const result = await db.execute(sql.raw(`SELECT ${select} FROM ${quote(table)}${whereClause(options.where)}${order ? ` ORDER BY ${order}` : ""}${limit}`));
      return result.rows;
    },
    async findFirst(options = {}) {
      const rows = await this.findMany({ ...options, take: 1 });
      return rows[0];
    },
    async findUnique(options = {}) {
      return this.findFirst(options);
    },
    async count(options = {}) {
      const result = await db.execute(sql.raw(`SELECT COUNT(*)::int AS count FROM ${quote(table)}${whereClause(options.where)}`));
      return Number(result.rows[0]?.count ?? 0);
    },
    async create(options) {
      const data = { ...options.data ?? {} };
      const keys = dataColumns(data);
      const result = await db.execute(sql.raw(`INSERT INTO ${quote(table)} (${keys.map(quote).join(", ")}) VALUES (${keys.map((k) => valueSql(data[k])).join(", ")}) RETURNING *`));
      return result.rows[0];
    },
    async createMany(options) {
      const rows = options.data ?? [];
      for (const row of rows) await this.create({ data: row });
      return { count: rows.length };
    },
    async update(options) {
      const data = options.data ?? {};
      const set = dataColumns(data).map((k) => {
        const v = data[k];
        return v && typeof v === "object" && v.decrement !== void 0 ? `${quote(k)} = ${quote(k)} - ${Number(v.decrement)}` : v && typeof v === "object" && v.increment !== void 0 ? `${quote(k)} = ${quote(k)} + ${Number(v.increment)}` : `${quote(k)} = ${valueSql(v)}`;
      }).join(", ");
      const auditSuffix = auditedTables.has(table) ? ', "updatedAt" = NOW()' : "";
      const result = await db.execute(sql.raw(`UPDATE ${quote(table)} SET ${set}${auditSuffix} WHERE "id" = '${String(options.where.id).replaceAll("'", "''")}' RETURNING *`));
      return result.rows[0];
    },
    async updateMany(options) {
      const data = options.data ?? {};
      const set = dataColumns(data).map((k) => {
        const v = data[k];
        return v && typeof v === "object" && v.decrement !== void 0 ? `${quote(k)} = ${quote(k)} - ${Number(v.decrement)}` : v && typeof v === "object" && v.increment !== void 0 ? `${quote(k)} = ${quote(k)} + ${Number(v.increment)}` : `${quote(k)} = ${valueSql(v)}`;
      }).join(", ");
      const result = await db.execute(sql.raw(`UPDATE ${quote(table)} SET ${set}${whereClause(options.where)}`));
      return { count: result.rowCount ?? 0 };
    },
    async delete(options) {
      const result = await db.execute(sql.raw(`DELETE FROM ${quote(table)} WHERE "id" = '${String(options.where.id).replaceAll("'", "''")}' RETURNING *`));
      return result.rows[0];
    },
    async aggregate(options = {}) {
      const sumField = options._sum ? Object.keys(options._sum)[0] : "amount";
      const result = await db.execute(sql.raw(`SELECT COALESCE(SUM(${quote(sumField)}), 0) AS sum FROM ${quote(table)}${whereClause(options.where)}`));
      return { _sum: { [sumField]: result.rows[0]?.sum ?? 0 } };
    },
    async upsert(options) {
      const existing = await this.findFirst({ where: options.where });
      if (existing) return this.update({ where: { id: existing.id }, data: options.update });
      return this.create({ data: options.create });
    }
  };
}
var fleetDb = new Proxy({}, { get: (_target, property) => property === "$transaction" ? transaction : model(String(property)) });
async function transaction(fn) {
  if (Array.isArray(fn)) return Promise.all(fn);
  return fn(fleetDb);
}

// server/_core/systemRouter.ts
var RELEASE = "fleetops-observability-20260820";
var systemRouter = router({
  health: publicProcedure.input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative"), correlationId: z.string().trim().min(8).max(128).optional() })).query(async ({ input }) => {
    const startedAt = Date.now();
    const correlationId = input.correlationId ?? randomUUID();
    try {
      await db.execute(sql2`select 1`);
      return { ok: true, release: RELEASE, database: "ok", checkedAt: (/* @__PURE__ */ new Date()).toISOString(), latencyMs: Date.now() - startedAt, clientTimestamp: input.timestamp, correlationId };
    } catch {
      return { ok: false, release: RELEASE, database: "degraded", checkedAt: (/* @__PURE__ */ new Date()).toISOString(), latencyMs: Date.now() - startedAt, clientTimestamp: input.timestamp, correlationId };
    }
  }),
  release: publicProcedure.query(() => ({ release: RELEASE, service: "FleetOps API", environment: process.env.NODE_ENV === "production" ? "production" : "development" })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/supabase.ts
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = process.env.SUPABASE_URL;
var serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
var authSupabaseUrl = supabaseUrl ?? process.env.VITE_SUPABASE_URL;
var authAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? serviceRoleKey;
var authIssuer = authSupabaseUrl ? `${authSupabaseUrl.replace(/\/$/, "")}/auth/v1` : null;
var supabaseJwks = /* @__PURE__ */ new Map();
if (!supabaseUrl || !serviceRoleKey) {
  console.warn("[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
}
var supabaseAdmin = createClient(
  supabaseUrl ?? "http://localhost:54321",
  serviceRoleKey ?? "development-placeholder",
  { auth: { autoRefreshToken: false, persistSession: false } }
);
var supabaseAuth = createClient(
  authSupabaseUrl ?? "http://localhost:54321",
  authAnonKey ?? "development-placeholder",
  { auth: { autoRefreshToken: false, persistSession: false } }
);
function getBearerToken(req) {
  const header = req?.headers?.authorization ?? (typeof req?.get === "function" ? req.get("authorization") : void 0);
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) return header.slice("bearer ".length).trim();
  const cookieToken = req?.cookies?.["sb-access-token"] ?? req?.cookies?.["supabase-auth-token"];
  return typeof cookieToken === "string" ? cookieToken : null;
}
function getCandidateSupabaseIssuer(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    if (typeof payload.iss !== "string") return null;
    const url = new URL(payload.iss);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || url.pathname !== "/auth/v1" || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
async function getSupabaseAuthIdentity(req) {
  const token = getBearerToken(req);
  if (!token) {
    console.warn("[Supabase] No bearer token on protected request", { path: req?.path ?? req?.url ?? "unknown" });
    return null;
  }
  const tokenIssuer = getCandidateSupabaseIssuer(token) ?? authIssuer;
  if (tokenIssuer) {
    try {
      const { createRemoteJWKSet, jwtVerify } = await import("jose");
      const jwks = supabaseJwks.get(tokenIssuer) ?? createRemoteJWKSet(new URL(`${tokenIssuer}/.well-known/jwks.json`));
      supabaseJwks.set(tokenIssuer, jwks);
      const { payload } = await jwtVerify(token, jwks, { issuer: tokenIssuer, audience: "authenticated", algorithms: ["ES256"] });
      if (typeof payload.sub === "string" && payload.sub.length > 0) {
        const userMetadata = payload.user_metadata && typeof payload.user_metadata === "object" && !Array.isArray(payload.user_metadata) ? payload.user_metadata : {};
        return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : null, user_metadata: userMetadata };
      }
    } catch (error2) {
      console.warn("[Supabase] Public-key bearer verification failed", { path: req?.path ?? req?.url ?? "unknown", reason: error2 instanceof Error ? error2.message : "verification_failed" });
    }
  }
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    console.warn("[Supabase] Bearer token rejected", { path: req?.path ?? req?.url ?? "unknown", reason: error?.message ?? "user_not_found" });
    return null;
  }
  return data.user;
}
async function getFleetOpsUserFromRequest(req) {
  const authUser = await getSupabaseAuthIdentity(req);
  if (!authUser) return null;
  const user = await fleetDb.user.findUnique({ where: { authUserId: authUser.id } }) ?? (authUser.email ? await fleetDb.user.findFirst({ where: { email: authUser.email } }) : null);
  if (!user) return null;
  const org = await fleetDb.organization.findFirst({ where: { id: user.orgId } });
  if (!org) return null;
  const normalizedOrg = {
    ...org,
    trialEndsAt: org.trialEndsAt instanceof Date ? org.trialEndsAt : new Date(String(org.trialEndsAt)),
    updatedAt: org.updatedAt instanceof Date ? org.updatedAt : new Date(String(org.updatedAt))
  };
  return { ...user, org: normalizedOrg, name: user.fullName };
}
async function provisionFleetOpsUser(input) {
  const existing = await fleetDb.user.findUnique({ where: { authUserId: input.authUserId }, include: { org: true } });
  if (existing) return existing;
  const role = input.role ?? "SUPERADMIN";
  return fleetDb.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName ?? `${input.fullName}'s Fleet`,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1e3),
        maxVehicles: 3,
        maxUsers: 5
      }
    });
    return tx.user.create({
      data: {
        authUserId: input.authUserId,
        orgId: org.id,
        email: input.email,
        fullName: input.fullName,
        role
      },
      include: { org: true }
    });
  });
}

// server/observability.ts
var SENSITIVE_VALUE = /(^|[?&\s])((?:token|access_token|refresh_token|password|secret|key)=)[^&\s]+/gi;
function createRequestId() {
  return crypto.randomUUID();
}
function redactMessage(message) {
  return message.replace(SENSITIVE_VALUE, "$1$2[REDACTED]").slice(0, 500);
}
function logRequestError(input) {
  console.error(JSON.stringify({
    event: "api_error",
    requestId: input.requestId,
    path: input.path ?? "unknown",
    code: input.code ?? "INTERNAL_SERVER_ERROR",
    message: redactMessage(input.message ?? "Unhandled API error"),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  }));
}
function logRequestSignal(input) {
  console.warn(JSON.stringify({
    event: input.event,
    requestId: input.requestId,
    path: input.path ?? "unknown",
    ...input.durationMs === void 0 ? {} : { durationMs: Math.round(input.durationMs) },
    ...input.code ? { code: input.code } : {},
    ...input.message ? { message: redactMessage(input.message) } : {},
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  }));
}

// server/storage.ts
var STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "fleetops-files";
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function ensureBucket() {
  const { error } = await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: "50MB"
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    logRequestSignal({ event: "storage_error", requestId: "storage", path: "createBucket", message: error.message });
    throw new Error(`Supabase Storage bucket setup failed: ${error.message}`);
  }
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  await ensureBucket();
  const key = appendHashSuffix(normalizeKey(relKey));
  const payload = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(key, payload, {
    contentType,
    upsert: false,
    cacheControl: "3600"
  });
  if (error) {
    logRequestSignal({ event: "storage_error", requestId: "storage", path: "upload", message: error.message });
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }
  const url = await storageGetSignedUrl(key);
  return { key, url };
}
async function storageGetSignedUrl(relKey) {
  const key = normalizeKey(relKey);
  const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(key, 900);
  if (error || !data?.signedUrl) {
    logRequestSignal({ event: "storage_error", requestId: "storage", path: "createSignedUrl", message: error?.message ?? "empty signed URL" });
    throw new Error(`Supabase Storage signed URL failed: ${error?.message ?? "empty signed URL"}`);
  }
  return data.signedUrl;
}

// server/role-policy.ts
function roleCanAct(role, allowed) {
  return allowed.includes(role);
}

// server/billing-plans.ts
var BILLING_PLANS = {
  STARTER: { id: "STARTER", name: "Starter", platformFeePaise: 299900, includedVehicles: 3, overageVehicleFeePaise: 5e4, maxUsers: 10, description: "For small operators and pilots." },
  GROWTH: { id: "GROWTH", name: "Growth", platformFeePaise: 999900, includedVehicles: 15, overageVehicleFeePaise: 45e3, maxUsers: 50, description: "For growing regional fleets." },
  SCALE: { id: "SCALE", name: "Scale", platformFeePaise: 2499900, includedVehicles: 50, overageVehicleFeePaise: 35e3, maxUsers: 150, description: "For multi-depot operators." },
  ENTERPRISE: { id: "ENTERPRISE", name: "Enterprise", platformFeePaise: 0, includedVehicles: 100, overageVehicleFeePaise: 3e4, maxUsers: 500, description: "For large fleets with custom service and integrations." }
};
function normalizePlan(value) {
  const candidate = String(value ?? "").toUpperCase();
  if (candidate === "STARTER" || candidate === "GROWTH" || candidate === "SCALE" || candidate === "ENTERPRISE") return candidate;
  return "STARTER";
}
function calculateMonthlyBill(planValue, activeVehicles, usageAddonsPaise = 0, creditsPaise = 0) {
  const plan = BILLING_PLANS[normalizePlan(planValue)];
  const billableVehicles = Math.max(0, Math.floor(activeVehicles));
  const overageVehicles = Math.max(0, billableVehicles - plan.includedVehicles);
  const subtotalPaise = Math.max(0, plan.platformFeePaise + overageVehicles * plan.overageVehicleFeePaise + Math.max(0, Math.floor(usageAddonsPaise)) - Math.max(0, Math.floor(creditsPaise)));
  return { plan, billableVehicles, overageVehicles, platformFeePaise: plan.platformFeePaise, overagePaise: overageVehicles * plan.overageVehicleFeePaise, usageAddonsPaise: Math.max(0, Math.floor(usageAddonsPaise)), creditsPaise: Math.max(0, Math.floor(creditsPaise)), subtotalPaise };
}
function billingLifecycle(trialEndsAt, paymentFailedAt, now = /* @__PURE__ */ new Date()) {
  if (paymentFailedAt) {
    const elapsedDays = Math.floor((now.getTime() - paymentFailedAt.getTime()) / 864e5);
    if (elapsedDays <= 7) return "PAYMENT_GRACE";
    if (elapsedDays <= 21) return "READ_ONLY_GRACE";
    return "SUSPENDED";
  }
  return trialEndsAt.getTime() >= now.getTime() ? "TRIAL" : "ACTIVE";
}
function billingWriteAllowed(status) {
  return status !== "SUSPENDED" && status !== "CANCELLED";
}

// server/razorpay.ts
import { createHmac, timingSafeEqual } from "node:crypto";
function isRazorpayWebhookEnabled() {
  return process.env.RAZORPAY_TEST_WEBHOOK_ENABLED === "true" && Boolean(process.env.RAZORPAY_TEST_WEBHOOK_SECRET);
}
function assertRazorpayTestMode() {
  const keyId = process.env.RAZORPAY_TEST_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_TEST_KEY_SECRET ?? "";
  if (!keyId.startsWith("rzp_test_") || !keySecret) throw new Error("Razorpay Test Mode credentials are not configured");
  return { keyId, keySecret };
}
async function createRazorpayTestOrder(input) {
  const { keyId, keySecret } = assertRazorpayTestMode();
  const amount = Math.max(100, Math.floor(input.amountPaise));
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency: "INR", receipt: input.receipt.slice(0, 40), notes: input.notes ?? {} })
  });
  if (!response.ok) throw new Error(`Razorpay Test Mode order request failed (${response.status})`);
  return await response.json();
}
function verifyRazorpayWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_TEST_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

// server/invitation-email.ts
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
function renderInvitationEmail(input) {
  const organization = escapeHtml(input.organizationName);
  const email = escapeHtml(input.inviteeEmail);
  const role = escapeHtml(input.role.replaceAll("_", " "));
  const joinUrl = escapeHtml(input.joinUrl);
  const expiry = escapeHtml(input.expiresAt.toLocaleDateString("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }));
  return {
    subject: `Join ${input.organizationName} on VahanSync`,
    text: `You have been invited to join ${input.organizationName} on VahanSync as ${input.role.replaceAll("_", " ")}. Open this secure link to create your account: ${input.joinUrl}. This invitation expires on ${expiry}. If you were not expecting this invitation, you can ignore it.`,
    html: `<!doctype html><html><body style="margin:0;background:#f7f1e8;color:#182033;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fffdf8;border:1px solid #eadfd4;border-radius:16px"><p style="color:#f26b38;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">VahanSync</p><h1 style="font-size:28px;margin:24px 0 12px">Join ${organization}</h1><p style="color:#5f6875;line-height:1.6">You have been invited to join this organization as <strong>${role}</strong>. Create your VahanSync account using the secure button below.</p><p><a href="${joinUrl}" style="display:inline-block;padding:13px 18px;background:#f26b38;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Join organization</a></p><p style="color:#7b8490;font-size:13px;line-height:1.6">This link was sent to ${email} and expires on ${expiry}. VahanSync will only use this invitation to establish your organization membership and role.</p><p style="color:#9aa1aa;font-size:12px">If you were not expecting this invitation, you can ignore this email.</p></main></body></html>`
  };
}
async function sendInvitationEmail(input) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: { message: "RESEND_API_KEY is not configured." } };
  const from = process.env.RESEND_FROM_EMAIL ?? "VahanSync <onboarding@resend.dev>";
  const email = renderInvitationEmail(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.inviteeEmail], subject: email.subject, html: email.html, text: email.text })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { error: { message: payload.message ?? payload.name ?? `Resend returned HTTP ${response.status}.` } };
    return { id: payload.id };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : "Resend request failed." } };
  }
}

// server/vehicle-identity.ts
function vehicleIdentity(vehicle) {
  const vin = String(vehicle?.vin ?? "").trim().toUpperCase();
  const registration = String(vehicle?.licensePlate ?? "").trim().toUpperCase();
  if (vin && registration) return `VIN ${vin} \xB7 Reg ${registration}`;
  if (vin) return `VIN ${vin}`;
  if (registration) return `Reg ${registration}`;
  return "Vehicle unavailable";
}

// server/twilio.ts
var OPERATIONAL_ALERT_TYPES = /* @__PURE__ */ new Set(["MAINTENANCE_THRESHOLD", "INVENTORY_LOW", "DOCUMENT_EXPIRY", "ALERT_ESCALATION", "WORK_ORDER_ESCALATION"]);
function configured(channel) {
  const hasCredential = Boolean(process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN);
  return process.env.TWILIO_ALERTS_ENABLED === "true" && Boolean(process.env.TWILIO_ACCOUNT_SID && hasCredential && (channel === "SMS" ? process.env.TWILIO_SMS_FROM : process.env.TWILIO_WHATSAPP_FROM));
}
async function recordDelivery(input) {
  return fleetDb.notificationDelivery.create({ data: { id: crypto.randomUUID(), ...input, attempt: 1, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() } });
}
function operationalMessage(title, message) {
  return `VahanSync operational alert: ${title}. ${message}`.slice(0, 1500);
}
async function sendTwilioMessage(channel, to, title, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const credentialSid = process.env.TWILIO_API_KEY_SID ?? accountSid;
  const credentialSecret = process.env.TWILIO_API_KEY_SECRET ?? process.env.TWILIO_AUTH_TOKEN;
  const body = new URLSearchParams({ To: channel === "WHATSAPP" ? `whatsapp:${to}` : to, From: channel === "WHATSAPP" ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM });
  const contentSid = channel === "WHATSAPP" ? process.env.TWILIO_WHATSAPP_CONTENT_SID : void 0;
  if (contentSid) {
    body.set("ContentSid", contentSid);
    body.set("ContentVariables", JSON.stringify({ "1": title, "2": message }));
  } else {
    body.set("Body", operationalMessage(title, message));
  }
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${credentialSid}:${credentialSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.message ?? `Twilio delivery failed with HTTP ${response.status}.`), { code: payload.code ? String(payload.code) : String(response.status) });
  return { providerMessageId: payload.sid, contentSid };
}
async function deliverOperationalNotification(notification, recipient) {
  if (!OPERATIONAL_ALERT_TYPES.has(notification.type) || !recipient.mobileNumber) return;
  const channels = [recipient.smsAlertsEnabled ? "SMS" : null, recipient.whatsappAlertsEnabled ? "WHATSAPP" : null].filter(Boolean);
  for (const channel of channels) {
    if (!configured(channel)) {
      await recordDelivery({ orgId: notification.orgId, notificationId: notification.id, recipientId: notification.recipientId, channel, status: "SKIPPED_CONFIGURATION" });
      continue;
    }
    try {
      const result = await sendTwilioMessage(channel, recipient.mobileNumber, notification.title, notification.message);
      await recordDelivery({ orgId: notification.orgId, notificationId: notification.id, recipientId: notification.recipientId, channel, status: "SENT", providerMessageId: result.providerMessageId, contentSid: result.contentSid, sentAt: /* @__PURE__ */ new Date() });
    } catch (error) {
      const failure = error;
      await recordDelivery({ orgId: notification.orgId, notificationId: notification.id, recipientId: notification.recipientId, channel, status: "FAILED", errorCode: failure.code, errorMessage: failure.message.slice(0, 500) });
    }
  }
}

// server/automation.ts
async function notifyRoles(orgId, roles, title, message, type, referenceId) {
  const recipients = await fleetDb.user.findMany({ where: { orgId, role: { in: roles } } });
  const severity = type === "MAINTENANCE_THRESHOLD" || type === "INVENTORY_LOW" ? "HIGH" : type === "DOCUMENT_EXPIRY" ? "CRITICAL" : "INFO";
  const sourceType = type === "MAINTENANCE_THRESHOLD" || type === "WORK_ORDER_ESCALATION" || type === "ALERT_ESCALATION" ? "WORK_ORDER" : type === "INVENTORY_LOW" || type === "PURCHASE_ORDER_DRAFT" ? "INVENTORY_LOW" : type === "DOCUMENT_EXPIRY" ? "DOCUMENT_EXPIRY" : "SYSTEM";
  const candidates = recipients.map((recipient) => ({ id: crypto.randomUUID(), orgId, recipientId: recipient.id, title, message, type, severity, sourceType, dedupeKey: `${type}:${referenceId ?? title}:${recipient.id}`, referenceId, isRead: false, createdAt: /* @__PURE__ */ new Date() }));
  const notifications2 = fleetDb.notification?.findFirst ? (await Promise.all(candidates.map(async (candidate) => await fleetDb.notification.findFirst({ where: { orgId, recipientId: candidate.recipientId, dedupeKey: candidate.dedupeKey, resolvedAt: null } }) ? null : candidate))).filter(Boolean) : candidates;
  if (notifications2.length) {
    await fleetDb.notification.createMany({ data: notifications2 });
    await Promise.all(notifications2.map((notification) => deliverOperationalNotification(notification, recipients.find((recipient) => recipient.id === notification.recipientId)).catch(() => void 0)));
  }
  return notifications2.length;
}
async function evaluateVehicleMaintenance(vehicleId, orgId) {
  const vehicle = await fleetDb.vehicle.findFirst({ where: { id: vehicleId, orgId } });
  if (!vehicle) return { createdWorkOrders: 0 };
  let createdWorkOrders = 0;
  const components2 = await fleetDb.component.findMany({ where: { vehicleId } });
  for (const component of components2) {
    if (String(component.status ?? "ACTIVE") !== "ACTIVE") continue;
    const consumed = Number(vehicle.currentOdometer) - Number(component.lastServicedOdometer);
    const installationAt = new Date(component.installationDate ?? Date.now()).getTime();
    const elapsedDays = Math.max(0, Math.floor((Date.now() - installationAt) / 864e5));
    const dueByKm = consumed >= Number(component.alertThresholdKm);
    const dueByDays = Number(component.alertThresholdDays ?? 0) > 0 && elapsedDays >= Number(component.alertThresholdDays);
    if (!dueByKm && !dueByDays) continue;
    const existing = await fleetDb.workOrder.findFirst({ where: { orgId, vehicleId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_PARTS", "READY_FOR_REVIEW", "REWORK"] }, title: { contains: component.name } } });
    if (existing) continue;
    const priorTriggers = fleetDb.auditEvent?.findMany ? await fleetDb.auditEvent.findMany({ where: { orgId, entityType: "COMPONENT", entityId: component.id, action: "MAINTENANCE_THRESHOLD_TRIGGERED" }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
    const sameServiceBaselineAlreadyTriggered = priorTriggers.some((event) => {
      try {
        return Number(JSON.parse(event.metadata ?? "{}").serviceBaseline ?? -1) === Number(component.lastServicedOdometer);
      } catch {
        return false;
      }
    });
    if (sameServiceBaselineAlreadyTriggered) continue;
    const consumedPercent = Number(component.expectedLifeKm) > 0 ? Math.round(consumed / Number(component.expectedLifeKm) * 100) : 0;
    const elapsedPercent = Number(component.expectedLifeDays ?? 0) > 0 ? Math.round(elapsedDays / Number(component.expectedLifeDays) * 100) : 0;
    const priority = consumed >= Number(component.expectedLifeKm) || Number(component.expectedLifeDays ?? 0) > 0 && elapsedDays >= Number(component.expectedLifeDays) ? "CRITICAL" : "HIGH";
    const lifecycleDetail = [dueByKm ? `${consumedPercent}% of odometer life consumed` : null, dueByDays ? `${elapsedPercent}% of time life elapsed` : null].filter(Boolean).join("; ");
    const workOrder = await fleetDb.workOrder.create({ data: { id: crypto.randomUUID(), orgId, vehicleId, title: `${component.name} service threshold reached`, description: `${component.name}: ${lifecycleDetail}.`, priority, status: "OPEN", createdAt: /* @__PURE__ */ new Date() } });
    await notifyRoles(orgId, ["SUPERADMIN", "FLEET_MANAGER"], "Maintenance lifecycle alert", `${vehicleIdentity(vehicle)}: ${component.name} crossed its service threshold.`, "MAINTENANCE_THRESHOLD", workOrder.id);
    if (fleetDb.auditEvent?.create) await fleetDb.auditEvent.create({ data: { id: crypto.randomUUID(), orgId, actorId: null, action: "MAINTENANCE_THRESHOLD_TRIGGERED", entityType: "COMPONENT", entityId: component.id, summary: `Threshold triggered for ${component.name}`, metadata: JSON.stringify({ workOrderId: workOrder.id, serviceBaseline: Number(component.lastServicedOdometer), currentOdometer: Number(vehicle.currentOdometer), elapsedDays, expectedLifeKm: Number(component.expectedLifeKm), expectedLifeDays: Number(component.expectedLifeDays ?? 0), alertThresholdKm: Number(component.alertThresholdKm), alertThresholdDays: Number(component.alertThresholdDays ?? 0), dueByKm, dueByDays }), createdAt: /* @__PURE__ */ new Date() } });
    createdWorkOrders += 1;
  }
  return { createdWorkOrders };
}
async function evaluateLowInventory(orgId) {
  const allParts = await fleetDb.inventoryPart.findMany({ where: { orgId } });
  const lowStock = allParts.filter((part) => Number(part.quantityOnHand) <= Number(part.minReorderLevel));
  if (!lowStock.length) return { lowStock: 0, draftPurchaseOrders: 0 };
  let draftPurchaseOrders = 0;
  let vendor = await fleetDb.vendor.findFirst({ where: { orgId, name: "FleetOps auto-reorder queue" } });
  if (!vendor) vendor = await fleetDb.vendor.create({ data: { id: crypto.randomUUID(), orgId, name: "FleetOps auto-reorder queue", phone: "SYSTEM", createdAt: /* @__PURE__ */ new Date() } });
  for (const part of lowStock) {
    const alreadyNotified = await fleetDb.notification.findFirst({ where: { orgId, referenceId: part.id, type: "INVENTORY_LOW", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1e3) } } });
    if (alreadyNotified) continue;
    const suggestedQty = Math.max(Number(part.minReorderLevel) * 2 - Number(part.quantityOnHand), 1);
    const purchaseOrder = await fleetDb.purchaseOrder.create({ data: { id: crypto.randomUUID(), orgId, vendorId: vendor.id, status: "DRAFT", totalCost: suggestedQty * Number(part.unitCost), createdAt: /* @__PURE__ */ new Date() } });
    await notifyRoles(orgId, ["SUPERADMIN", "INVENTORY_MANAGER"], "Inventory below reorder level", `${part.name} (${part.sku}) has ${part.quantityOnHand} units remaining. Draft PO created for ${suggestedQty} units.`, "INVENTORY_LOW", part.id);
    await notifyRoles(orgId, ["SUPERADMIN", "INVENTORY_MANAGER"], "Draft purchase order created", `Draft PO ${purchaseOrder.id.slice(0, 8).toUpperCase()} was created for ${part.name}.`, "PURCHASE_ORDER_DRAFT", purchaseOrder.id);
    draftPurchaseOrders += 1;
  }
  return { lowStock: lowStock.length, draftPurchaseOrders };
}
async function evaluateDocumentExpiry(orgId) {
  const documents2 = await fleetDb.document.findMany({ where: { orgId } });
  const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
  const expiring = documents2.filter((document) => new Date(document.expiryDate).getTime() <= horizon.getTime());
  for (const document of expiring) {
    const alreadyNotified = await fleetDb.notification.findFirst({ where: { orgId, referenceId: document.id, type: "DOCUMENT_EXPIRY", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1e3) } } });
    if (alreadyNotified) continue;
    await notifyRoles(orgId, ["SUPERADMIN", "FLEET_MANAGER"], "Compliance document expiring", `${document.title} expires on ${new Date(document.expiryDate).toLocaleDateString("en-IN")}.`, "DOCUMENT_EXPIRY", document.id);
  }
  return { expiring: expiring.length };
}
async function evaluateEscalations(orgId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1e3);
  let escalated = 0;
  if (fleetDb.notification?.findMany) {
    const alerts = await fleetDb.notification.findMany({ where: { orgId, severity: "CRITICAL", acknowledgedAt: null, escalationLevel: 0, createdAt: { lte: cutoff } }, take: 100 });
    for (const alert of alerts) {
      if (fleetDb.notification.updateMany) await fleetDb.notification.updateMany({ where: { id: alert.id, orgId, escalationLevel: 0 }, data: { escalationLevel: 1, updatedAt: /* @__PURE__ */ new Date() } });
      await notifyRoles(orgId, ["SUPERADMIN", "FLEET_MANAGER"], "Critical maintenance alert escalated", `${alert.title}: ${alert.message}`, "ALERT_ESCALATION", alert.referenceId ?? void 0);
      escalated += 1;
    }
  }
  if (fleetDb.workOrder?.findMany) {
    const overdueOrders = await fleetDb.workOrder.findMany({ where: { orgId, priority: "CRITICAL", status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_PARTS", "REWORK"] }, createdAt: { lte: cutoff } }, take: 100 });
    for (const order of overdueOrders) {
      const marker = fleetDb.notification?.findFirst ? await fleetDb.notification.findFirst({ where: { orgId, type: "WORK_ORDER_ESCALATION", referenceId: order.id } }) : null;
      if (marker) continue;
      await notifyRoles(orgId, ["SUPERADMIN", "FLEET_MANAGER"], "Critical work order overdue", `${order.title} remains ${order.status} after 24 hours.`, "WORK_ORDER_ESCALATION", order.id);
      escalated += 1;
    }
  }
  return escalated;
}
async function evaluateAllOrganizationsUnsafe() {
  const organizations2 = await fleetDb.organization.findMany({ select: { id: true } });
  let maintenanceOrders = 0;
  let lowStockParts = 0;
  let draftPurchaseOrders = 0;
  let expiringDocuments = 0;
  let escalatedAlerts = 0;
  for (const org of organizations2) {
    const vehicles2 = await fleetDb.vehicle.findMany({ where: { orgId: org.id }, select: { id: true } });
    for (const vehicle of vehicles2) maintenanceOrders += (await evaluateVehicleMaintenance(vehicle.id, org.id)).createdWorkOrders;
    const inventory = await evaluateLowInventory(org.id);
    lowStockParts += inventory.lowStock;
    draftPurchaseOrders += inventory.draftPurchaseOrders;
    expiringDocuments += (await evaluateDocumentExpiry(org.id)).expiring;
    escalatedAlerts += await evaluateEscalations(org.id);
  }
  return { organizations: organizations2.length, maintenanceOrders, lowStockParts, draftPurchaseOrders, expiringDocuments, escalatedAlerts };
}
async function evaluateAllOrganizations() {
  try {
    return await evaluateAllOrganizationsUnsafe();
  } catch (error) {
    logRequestSignal({ event: "automation_failure", requestId: "heartbeat", path: "evaluateAllOrganizations", message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// server/routers.ts
var Priority = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", CRITICAL: "CRITICAL" };
var WorkOrderStatus = { OPEN: "OPEN", IN_PROGRESS: "IN_PROGRESS", COMPLETED: "COMPLETED", CANCELLED: "CANCELLED" };
var CITY_BUS_MAINTENANCE_TEMPLATE = [
  { name: "Engine Oil", expectedLifeKm: 1e4, alertThresholdKm: 8e3 },
  { name: "Brakes", expectedLifeKm: 5e4, alertThresholdKm: 4e4 },
  { name: "Tires", expectedLifeKm: 6e4, alertThresholdKm: 5e4 }
];
var COMPONENT_CATALOG = [
  "ENGINE",
  "TRANSMISSION",
  "BRAKE_SYSTEM",
  "SUSPENSION",
  "TIRE",
  "BATTERY",
  "ALTERNATOR",
  "STARTER",
  "AIR_FILTER",
  "OIL_FILTER",
  "FUEL_FILTER",
  "SPARK_PLUG",
  "BELT",
  "HOSE",
  "LIGHT",
  "WIPER",
  "CLUTCH",
  "RADIATOR",
  "EXHAUST",
  "OTHER"
];
function assertWritable(org) {
  if (!billingWriteAllowed(org.billingStatus)) throw new TRPCError3({ code: "FORBIDDEN", message: org.billingStatus === "CANCELLED" ? "The subscription is cancelled. Historical data and exports remain available, but operational writes are paused." : "Billing is suspended. Historical data and exports remain available, but operational writes are paused until payment is restored." });
  if (org.subscriptionTier === "TRIAL_FREE" && org.trialEndsAt.getTime() < Date.now()) {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Your trial has expired. Upgrade your FleetOps plan to continue writing data." });
  }
}
async function assertVehicleCapacity(orgId, maxVehicles) {
  const count = await fleetDb.vehicle.count({ where: { orgId } });
  if (count >= maxVehicles) throw new TRPCError3({ code: "FORBIDDEN", message: `Vehicle limit reached (${maxVehicles}). Upgrade your FleetOps plan to add more vehicles.` });
}
async function assertUserCapacity(orgId, maxUsers) {
  const count = await fleetDb.user.count({ where: { orgId } });
  if (count >= maxUsers) throw new TRPCError3({ code: "FORBIDDEN", message: `User limit reached (${maxUsers}). Upgrade your FleetOps plan to invite more team members.` });
}
var ALLOWED_DOCUMENT_TYPES = /* @__PURE__ */ new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
var MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
function decodeDocumentUpload(fileData, contentType = "application/octet-stream") {
  if (!ALLOWED_DOCUMENT_TYPES.has(contentType)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Only PDF, JPEG, PNG, and WebP documents are allowed." });
  const raw = fileData.replace(/^data:[^;]+;base64,/, "");
  let bytes;
  try {
    bytes = Buffer.from(raw, "base64");
  } catch {
    throw new TRPCError3({ code: "BAD_REQUEST", message: "The uploaded document is not valid base64 data." });
  }
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new TRPCError3({ code: "BAD_REQUEST", message: "Document files must be between 1 byte and 3 MB." });
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return { bytes, checksum, sizeBytes: bytes.length };
}
function retentionAfterExpiry(expiryDate) {
  return new Date(Math.max(expiryDate.getTime(), Date.now()) + 7 * 365 * 24 * 60 * 60 * 1e3);
}
function requireRole(role, allowed) {
  if (!roleCanAct(role, allowed)) throw new TRPCError3({ code: "FORBIDDEN", message: "Your role cannot perform this action." });
}
function csvCell(value) {
  const text2 = value === null || value === void 0 ? "" : String(value);
  return /[",\n]/.test(text2) ? `"${text2.replaceAll('"', '""')}"` : text2;
}
function csvDocument(rows, headers) {
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}
function parseComplianceCsv(csv) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["CSV is empty."] };
  const headers = lines[0].split(",").map((header) => header.trim());
  const required = ["title", "docType", "expiryDate", "vehicleId"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) return { rows: [], errors: [`Missing required columns: ${missing.join(", ")}`] };
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(",").map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    const errors = [];
    if (!row.title || row.title.length < 2) errors.push("title is required");
    if (!["INSURANCE", "RC", "FITNESS", "PERMIT", "DRIVER_LICENSE"].includes(row.docType)) errors.push("docType is invalid");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate) || Number.isNaN(new Date(row.expiryDate).getTime())) errors.push("expiryDate must be YYYY-MM-DD");
    if (!/^[0-9a-f-]{36}$/i.test(row.vehicleId)) errors.push("vehicleId must be a UUID");
    return { rowNumber: index + 2, row, errors };
  });
  return { rows, errors: rows.flatMap((item) => item.errors.map((error) => `Row ${item.rowNumber}: ${error}`)) };
}
function parseInventoryCsv(csv) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["CSV is empty."] };
  const headers = lines[0].split(",").map((header) => header.trim());
  const required = ["sku", "name", "quantityOnHand", "minReorderLevel", "unitCost"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) return { rows: [], errors: [`Missing required columns: ${missing.join(", ")}`] };
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(",").map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    const errors = [];
    if (!row.sku) errors.push("sku is required");
    if (!row.name || row.name.length < 2) errors.push("name is required");
    for (const field of ["quantityOnHand", "minReorderLevel", "unitCost"]) if (row[field] === "" || Number.isNaN(Number(row[field])) || Number(row[field]) < 0) errors.push(`${field} must be a non-negative number`);
    return { rowNumber: index + 2, row, errors };
  });
  return { rows, errors: rows.flatMap((item) => item.errors.map((error) => `Row ${item.rowNumber}: ${error}`)) };
}
function pdfText(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("\n", " ");
}
function simplePdf(title, lines) {
  const content = [`BT`, `/F1 16 Tf`, `50 760 Td`, `(${pdfText(title)}) Tj`, `/F1 10 Tf`, ...lines.flatMap((line) => [`0 -18 Td`, `(${pdfText(line)}) Tj`]), `ET`].join("\n");
  const objects = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`, `<< /Length ${content.length} >>
stream
${content}
endstream`];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj
${objects[index]}
endobj
`;
  }
  const xref = pdf.length;
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f 
${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}
trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xref}
%%EOF`;
  return Buffer.from(pdf, "utf8").toString("base64");
}
async function recordAudit(ctx, event) {
  if (!fleetDb.auditEvent?.create) return void 0;
  return fleetDb.auditEvent.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, actorId: ctx.fleetopsUser.id, actorRole: ctx.fleetopsUser.role, action: event.action, entityType: event.entityType, entityId: event.entityId, summary: event.summary, metadata: event.metadata ? JSON.stringify(event.metadata) : void 0, createdAt: /* @__PURE__ */ new Date() } });
}
var FLEETOPS_SERVER_RELEASE = "invite-schema-91663e37";
var INVITATION_TIMEOUT_MS = 12e3;
async function withServerTimeout(promise, message, timeoutMs = INVITATION_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new TRPCError3({ code: "TIMEOUT", message })), timeoutMs);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function createAuthInvitation(email, redirectTo) {
  const admin = supabaseAdmin.auth.admin;
  if (typeof admin.generateLink === "function") return admin.generateLink({ type: "invite", email, options: { redirectTo } });
  return admin.inviteUserByEmail(email, { redirectTo });
}
async function assignedVehicleIds(ctx) {
  const rows = await fleetDb.vehicleAssignment.findMany({ where: { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id, active: true } });
  return rows.map((row) => row.vehicleId).filter(Boolean);
}
async function assertDriverVehicle(ctx, vehicleId) {
  if (ctx.fleetopsUser.role !== "DRIVER") return;
  const assigned = await fleetDb.vehicleAssignment.findFirst({ where: { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id, vehicleId, active: true } });
  if (!assigned) throw new TRPCError3({ code: "FORBIDDEN", message: "Drivers may only access their currently assigned vehicle." });
}
async function hydrateVehiclesWithComponents(vehicles2) {
  if (!vehicles2.length) return vehicles2;
  const components2 = await fleetDb.component.findMany({ where: { vehicleId: { in: vehicles2.map((vehicle) => vehicle.id) } }, orderBy: { name: "asc" } });
  const componentsByVehicle = /* @__PURE__ */ new Map();
  for (const component of components2) componentsByVehicle.set(component.vehicleId, [...componentsByVehicle.get(component.vehicleId) ?? [], component]);
  return vehicles2.map((vehicle) => ({ ...vehicle, components: componentsByVehicle.get(vehicle.id) ?? [] }));
}
async function hydrateWorkOrders(orders, orgId) {
  if (!orders.length) return orders;
  const vehicleIds = Array.from(new Set(orders.map((order) => order.vehicleId).filter(Boolean)));
  const assigneeIds = Array.from(new Set(orders.map((order) => order.assignedMechanicId).filter(Boolean)));
  const orderIds = orders.map((order) => order.id);
  const [vehicles2, assignees, partsUsed] = await Promise.all([
    fleetDb.vehicle.findMany({ where: { orgId, id: { in: vehicleIds } } }),
    assigneeIds.length ? fleetDb.user.findMany({ where: { orgId, id: { in: assigneeIds } } }) : [],
    fleetDb.workOrderPart.findMany({ where: { workOrderId: { in: orderIds } } })
  ]);
  const partIds = Array.from(new Set(partsUsed.map((part) => part.partId).filter(Boolean)));
  const parts = partIds.length ? await fleetDb.inventoryPart.findMany({ where: { orgId, id: { in: partIds } } }) : [];
  const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
  const assigneeById = new Map(assignees.map((assignee) => [assignee.id, assignee]));
  const partById = new Map(parts.map((part) => [part.id, part]));
  const partsByOrder = /* @__PURE__ */ new Map();
  for (const partUse of partsUsed) partsByOrder.set(partUse.workOrderId, [...partsByOrder.get(partUse.workOrderId) ?? [], { ...partUse, part: partById.get(partUse.partId) ?? null }]);
  return orders.map((order) => ({ ...order, vehicle: vehicleById.get(order.vehicleId) ?? null, assignedMechanic: order.assignedMechanicId ? assigneeById.get(order.assignedMechanicId) ?? null : null, partsUsed: partsByOrder.get(order.id) ?? [] }));
}
function validateOdometerReading(current, reading, elapsedDays = 1) {
  if (reading < current) throw new TRPCError3({ code: "BAD_REQUEST", message: "Odometer readings cannot move backwards." });
  if (reading - current > Math.max(1, elapsedDays) * 1e3) throw new TRPCError3({ code: "BAD_REQUEST", message: `Odometer increase exceeds the ${Math.max(1, elapsedDays) * 1e3} km limit for the elapsed period.` });
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.fleetopsUser ?? ctx.user),
    logout: publicProcedure.mutation(() => ({ success: true }))
  }),
  profile: router({
    get: fleetOpsProcedure.query(async ({ ctx }) => {
      const member = await fleetDb.user.findFirst({ where: { id: ctx.fleetopsUser.id, orgId: ctx.fleetopsUser.orgId } });
      if (!member) throw new TRPCError3({ code: "NOT_FOUND", message: "Your organization profile could not be found." });
      return { id: member.id, fullName: member.fullName, email: member.email, role: member.role, organizationName: ctx.fleetopsUser.org.name, mobileNumber: member.mobileNumber ?? "", smsAlertsEnabled: Boolean(member.smsAlertsEnabled), whatsappAlertsEnabled: Boolean(member.whatsappAlertsEnabled) };
    }),
    update: fleetOpsProcedure.input(z2.object({ fullName: z2.string().trim().min(2).max(120), mobileNumber: z2.string().trim(), smsAlertsEnabled: z2.boolean(), whatsappAlertsEnabled: z2.boolean() })).mutation(async ({ ctx, input }) => {
      let mobileNumber;
      try {
        mobileNumber = normalizeIndianE164Mobile(input.mobileNumber);
      } catch (error) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Use an Indian mobile number in +91XXXXXXXXXX format." });
      }
      if ((input.smsAlertsEnabled || input.whatsappAlertsEnabled) && !mobileNumber) throw new TRPCError3({ code: "BAD_REQUEST", message: "Save a mobile number before enabling SMS or WhatsApp alerts." });
      const existing = await fleetDb.user.findFirst({ where: { id: ctx.fleetopsUser.id, orgId: ctx.fleetopsUser.orgId } });
      if (!existing) throw new TRPCError3({ code: "NOT_FOUND", message: "Your organization profile could not be found." });
      const now = /* @__PURE__ */ new Date();
      const member = await fleetDb.user.update({ where: { id: ctx.fleetopsUser.id }, data: { fullName: input.fullName, mobileNumber, smsAlertsEnabled: mobileNumber ? input.smsAlertsEnabled : false, whatsappAlertsEnabled: mobileNumber ? input.whatsappAlertsEnabled : false, smsOptedInAt: mobileNumber && input.smsAlertsEnabled ? existing.smsOptedInAt ?? now : null, whatsappOptedInAt: mobileNumber && input.whatsappAlertsEnabled ? existing.whatsappOptedInAt ?? now : null } });
      const authUser = await getSupabaseAuthIdentity(ctx.req);
      if (authUser) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { user_metadata: { ...authUser.user_metadata, fullName: input.fullName } });
        if (error) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: `Profile was saved, but Supabase display metadata could not be refreshed: ${error.message}` });
      }
      await recordAudit(ctx, { action: "PROFILE_UPDATED", entityType: "USER", entityId: member.id, summary: "Member updated their personal profile and alert preferences", metadata: { fullName: member.fullName, smsAlertsEnabled: member.smsAlertsEnabled, whatsappAlertsEnabled: member.whatsappAlertsEnabled } });
      return member;
    })
  }),
  organizationSettings: router({
    get: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const existing = await fleetDb.organizationSetting.findFirst({ where: { orgId: ctx.fleetopsUser.orgId } });
      return existing ?? { orgId: ctx.fleetopsUser.orgId, timezone: "Asia/Kolkata", odometerMaxDailyKm: 1e3, laborRatePerHour: "0", safetyContactName: null, safetyContactPhone: null };
    }),
    update: fleetOpsProcedure.input(z2.object({ timezone: z2.string().trim().min(3).max(80), odometerMaxDailyKm: z2.number().int().min(100).max(5e3), laborRatePerHour: z2.number().nonnegative().max(1e5).default(0), safetyContactName: z2.string().trim().max(160).optional(), safetyContactPhone: z2.string().trim().max(40).optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      assertWritable(ctx.fleetopsUser.org);
      const existing = await fleetDb.organizationSetting.findFirst({ where: { orgId: ctx.fleetopsUser.orgId } });
      const settings = existing ? await fleetDb.organizationSetting.update({ where: { id: existing.id }, data: input }) : await fleetDb.organizationSetting.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, ...input, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "ORGANIZATION_SETTINGS_UPDATED", entityType: "ORGANIZATION", entityId: ctx.fleetopsUser.orgId, summary: "Organization operating settings updated", metadata: input });
      return settings;
    })
  }),
  maintenanceTemplates: router({
    list: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      return [{ id: "CITY_BUS", name: "City bus preventive maintenance", components: CITY_BUS_MAINTENANCE_TEMPLATE }];
    }),
    applyTemplate: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid(), templateId: z2.enum(["CITY_BUS"]) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle not found in this organization." });
      const existing = await fleetDb.component.findMany({ where: { vehicleId: vehicle.id } });
      const names = new Set(existing.map((item) => item.name));
      const added = CITY_BUS_MAINTENANCE_TEMPLATE.filter((template) => !names.has(template.name));
      await Promise.all(added.map((template) => fleetDb.component.create({ data: { id: crypto.randomUUID(), vehicleId: vehicle.id, name: template.name, componentType: template.name === "Engine Oil" ? "OIL_FILTER" : template.name === "Brakes" ? "BRAKE_SYSTEM" : "TIRE", installationDate: /* @__PURE__ */ new Date(), expectedLifeKm: template.expectedLifeKm, lastServicedOdometer: Number(vehicle.currentOdometer), alertThresholdKm: template.alertThresholdKm } })));
      await recordAudit(ctx, { action: "MAINTENANCE_TEMPLATE_APPLIED", entityType: "VEHICLE", entityId: vehicle.id, summary: `Applied CITY_BUS maintenance template to ${vehicleIdentity(vehicle)}`, metadata: { templateId: input.templateId, added: added.map((item) => item.name), skippedExisting: CITY_BUS_MAINTENANCE_TEMPLATE.length - added.length } });
      return { vehicleId: vehicle.id, templateId: input.templateId, added: added.length, skippedExisting: CITY_BUS_MAINTENANCE_TEMPLATE.length - added.length };
    })
  }),
  onboarding: router({
    bootstrap: publicProcedure.input(z2.object({ orgName: z2.string().min(2).optional(), fullName: z2.string().min(2).optional() })).mutation(async ({ ctx, input }) => {
      const authUser = await getSupabaseAuthIdentity(ctx.req);
      if (!authUser?.email) throw new TRPCError3({ code: "UNAUTHORIZED", message: "A valid Supabase access token is required." });
      return provisionFleetOpsUser({ authUserId: authUser.id, email: authUser.email, fullName: input.fullName ?? String(authUser.user_metadata?.fullName ?? authUser.email.split("@")[0]), orgName: input.orgName ?? String(authUser.user_metadata?.orgName ?? `${input.fullName ?? authUser.email.split("@")[0]}'s Fleet`) });
    }),
    complete: fleetOpsProcedure.input(z2.object({ orgName: z2.string().min(2), fullName: z2.string().min(2), mobileNumber: z2.string().trim().optional().default(""), smsAlertsEnabled: z2.boolean().optional().default(false), whatsappAlertsEnabled: z2.boolean().optional().default(false) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      let mobileNumber;
      try {
        mobileNumber = normalizeIndianE164Mobile(input.mobileNumber);
      } catch (error) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Use an Indian mobile number in +91XXXXXXXXXX format." });
      }
      if ((input.smsAlertsEnabled || input.whatsappAlertsEnabled) && !mobileNumber) throw new TRPCError3({ code: "BAD_REQUEST", message: "Save a mobile number before enabling SMS or WhatsApp alerts." });
      const updated = await fleetDb.$transaction(async (tx) => {
        const user = await tx.user.update({ where: { id: ctx.fleetopsUser.id }, data: { fullName: input.fullName, mobileNumber, smsAlertsEnabled: mobileNumber ? input.smsAlertsEnabled : false, whatsappAlertsEnabled: mobileNumber ? input.whatsappAlertsEnabled : false, smsOptedInAt: mobileNumber && input.smsAlertsEnabled ? /* @__PURE__ */ new Date() : null, whatsappOptedInAt: mobileNumber && input.whatsappAlertsEnabled ? /* @__PURE__ */ new Date() : null } });
        const org = await tx.organization.update({ where: { id: ctx.fleetopsUser.orgId }, data: { name: input.orgName } });
        return { user, org };
      });
      const authUser = await getSupabaseAuthIdentity(ctx.req);
      if (!authUser) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Your Supabase session expired. Sign in again to finish onboarding." });
      const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { user_metadata: { ...authUser.user_metadata, fullName: input.fullName, orgName: input.orgName, needsOnboarding: false } });
      if (metadataError) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: `Organization was saved, but onboarding state could not be finalized: ${metadataError.message}` });
      return updated;
    }),
    inviteDetails: publicProcedure.input(z2.object({ token: z2.string().uuid() })).query(async ({ input }) => {
      const invite = await fleetDb.invitation.findFirst({ where: { tokenHash: input.token, acceptedAt: null, expiresAt: { gt: /* @__PURE__ */ new Date() } } });
      if (!invite) throw new TRPCError3({ code: "NOT_FOUND", message: "This invitation is invalid, expired, or already redeemed." });
      const org = await fleetDb.organization.findFirst({ where: { id: invite.orgId } });
      if (!org) throw new TRPCError3({ code: "NOT_FOUND", message: "The invitation organization no longer exists." });
      return { email: invite.email, role: invite.role, organization: { id: org.id, name: org.name }, expiresAt: invite.expiresAt };
    }),
    completeInviteWithPassword: publicProcedure.input(z2.object({ token: z2.string().uuid(), fullName: z2.string().min(2), password: z2.string().min(8).max(128), mobileNumber: z2.string().trim().optional().default(""), smsAlertsEnabled: z2.boolean().optional().default(false), whatsappAlertsEnabled: z2.boolean().optional().default(false) })).mutation(async ({ input }) => {
      const invite = await fleetDb.invitation.findFirst({ where: { tokenHash: input.token, acceptedAt: null, expiresAt: { gt: /* @__PURE__ */ new Date() } } });
      if (!invite) throw new TRPCError3({ code: "NOT_FOUND", message: "This invitation is invalid, expired, or already redeemed." });
      let mobileNumber;
      try {
        mobileNumber = normalizeIndianE164Mobile(input.mobileNumber);
      } catch (error) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Use an Indian mobile number in +91XXXXXXXXXX format." });
      }
      if ((input.smsAlertsEnabled || input.whatsappAlertsEnabled) && !mobileNumber) throw new TRPCError3({ code: "BAD_REQUEST", message: "Save a mobile number before enabling SMS or WhatsApp alerts." });
      const email = invite.email.toLowerCase();
      const existingAuth = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1e3 });
      let authUser = existingAuth.data.users.find((user) => user.email?.toLowerCase() === email);
      let authError = existingAuth.error;
      if (authUser) {
        const updatedAuth = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password: input.password, email_confirm: true, user_metadata: { ...authUser.user_metadata, fullName: input.fullName, needsOnboarding: false, invitationToken: input.token } });
        authUser = updatedAuth.data.user ?? authUser;
        authError = updatedAuth.error;
      } else {
        const createdAuth = await supabaseAdmin.auth.admin.createUser({ email, password: input.password, email_confirm: true, user_metadata: { fullName: input.fullName, needsOnboarding: false, invitationToken: input.token } });
        authUser = createdAuth.data.user ?? void 0;
        authError = createdAuth.error;
      }
      if (authError || !authUser) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: `The invited account could not be prepared: ${authError?.message ?? "Auth user was not returned."}` });
      const joined = await fleetDb.$transaction(async (tx) => {
        const preferenceData = { mobileNumber, smsAlertsEnabled: mobileNumber ? input.smsAlertsEnabled : false, whatsappAlertsEnabled: mobileNumber ? input.whatsappAlertsEnabled : false, smsOptedInAt: mobileNumber && input.smsAlertsEnabled ? /* @__PURE__ */ new Date() : null, whatsappOptedInAt: mobileNumber && input.whatsappAlertsEnabled ? /* @__PURE__ */ new Date() : null };
        const user = await tx.user.upsert({ where: { authUserId: authUser.id }, update: { orgId: invite.orgId, role: invite.role, email, fullName: input.fullName, ...preferenceData }, create: { authUserId: authUser.id, orgId: invite.orgId, role: invite.role, email, fullName: input.fullName, ...preferenceData } });
        await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: /* @__PURE__ */ new Date() } });
        return user;
      });
      const inviteOrg = await fleetDb.organization.findFirst({ where: { id: invite.orgId } });
      const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { user_metadata: { ...authUser.user_metadata, fullName: joined.fullName, orgId: joined.orgId, orgName: inviteOrg?.name, role: joined.role, needsOnboarding: false, invitationToken: void 0 } });
      if (metadataError) console.warn("[Invitation] Membership created; Auth metadata sync will be retried from the database-backed profile.", { authUserId: authUser.id, orgId: joined.orgId, reason: metadataError.message });
      return { email, role: joined.role, organizationName: inviteOrg?.name ?? "", metadataSyncPending: Boolean(metadataError) };
    }),
    acceptInvite: publicProcedure.input(z2.object({ token: z2.string().uuid(), fullName: z2.string().min(2).optional() })).mutation(async ({ ctx, input }) => {
      const authUser = await getSupabaseAuthIdentity(ctx.req);
      if (!authUser?.email) throw new TRPCError3({ code: "UNAUTHORIZED", message: "A valid Supabase access token is required." });
      const invite = await fleetDb.invitation.findFirst({ where: { tokenHash: input.token, email: authUser.email, acceptedAt: null, expiresAt: { gt: /* @__PURE__ */ new Date() } } });
      if (!invite) throw new TRPCError3({ code: "NOT_FOUND", message: "Invitation is invalid, expired, or already redeemed." });
      const user = await fleetDb.$transaction(async (tx) => {
        const joined = await tx.user.upsert({ where: { authUserId: authUser.id }, update: { orgId: invite.orgId, role: invite.role, email: authUser.email, fullName: input.fullName ?? String(authUser.user_metadata?.fullName ?? authUser.email.split("@")[0]) }, create: { authUserId: authUser.id, orgId: invite.orgId, role: invite.role, email: authUser.email, fullName: input.fullName ?? String(authUser.user_metadata?.fullName ?? authUser.email.split("@")[0]) } });
        await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: /* @__PURE__ */ new Date() } });
        return joined;
      });
      const inviteOrg = await fleetDb.organization.findFirst({ where: { id: invite.orgId } });
      const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { user_metadata: { ...authUser.user_metadata, fullName: user.fullName, orgId: user.orgId, orgName: inviteOrg?.name, role: user.role, needsOnboarding: false, invitationToken: void 0 } });
      if (metadataError) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: `Organization membership was created, but the session metadata could not be finalized: ${metadataError.message}` });
      return user;
    })
  }),
  dashboard: router({
    summary: fleetOpsProcedure.query(async ({ ctx }) => {
      const orgId = ctx.fleetopsUser.orgId;
      const [vehicles2, openWorkOrders, inventoryAlerts, unreadNotifications, spend] = await Promise.all([
        fleetDb.vehicle.findMany({ where: { orgId }, orderBy: { updatedAt: "desc" }, take: 10 }),
        fleetDb.workOrder.count({ where: { orgId, status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] } } }),
        fleetDb.inventoryPart.count({ where: { orgId, quantityOnHand: { lte: 5 } } }),
        fleetDb.notification.count({ where: { orgId, recipientId: ctx.fleetopsUser.id, isRead: false } }),
        fleetDb.financialRecord.aggregate({ where: { orgId, type: "EXPENSE" }, _sum: { amount: true } })
      ]);
      const authUser = await getSupabaseAuthIdentity(ctx.req);
      const defaultOrgName = `${ctx.fleetopsUser.fullName}'s Fleet`;
      const needsOnboarding = authUser?.user_metadata?.needsOnboarding === true || authUser?.user_metadata?.needsOnboarding === "true" || ctx.fleetopsUser.org.name === defaultOrgName;
      return { org: ctx.fleetopsUser.org, role: ctx.fleetopsUser.role, needsOnboarding, vehicles: vehicles2, openWorkOrders, inventoryAlerts, unreadNotifications, monthlyExpense: spend._sum.amount ?? 0 };
    })
  }),
  components: router({
    list: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid().optional() }).optional()).query(({ ctx, input }) => fleetDb.component.findMany({ where: { vehicle: { orgId: ctx.fleetopsUser.orgId }, ...input?.vehicleId ? { vehicleId: input.vehicleId } : {} }, orderBy: { name: "asc" } })),
    create: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid(), inventoryPartId: z2.string().uuid().optional(), name: z2.string().min(2), componentType: z2.enum(COMPONENT_CATALOG).default("OTHER"), componentSubtype: z2.string().trim().max(120).optional(), brand: z2.string().trim().max(120).optional(), partNumber: z2.string().trim().max(120).optional(), serialNumber: z2.string().trim().max(120).optional(), installationDate: z2.coerce.date().optional(), expectedLifeKm: z2.number().positive(), expectedLifeDays: z2.number().int().positive().optional(), lastServicedOdometer: z2.number().nonnegative(), alertThresholdKm: z2.number().positive(), alertThresholdDays: z2.number().int().positive().optional(), notes: z2.string().trim().max(2e3).optional(), status: z2.enum(["ACTIVE", "REPLACED", "REMOVED"]).default("ACTIVE") })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC"]);
      assertWritable(ctx.fleetopsUser.org);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle not found." });
      if (input.inventoryPartId) {
        const part = await fleetDb.inventoryPart.findFirst({ where: { id: input.inventoryPartId, orgId: ctx.fleetopsUser.orgId } });
        if (!part) throw new TRPCError3({ code: "BAD_REQUEST", message: "Linked inventory part is outside this organization." });
      }
      const created = await fleetDb.component.create({ data: { id: crypto.randomUUID(), ...input, installationDate: input.installationDate ?? /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "COMPONENT_CREATED", entityType: "COMPONENT", entityId: created.id, summary: `${created.name} installed on ${vehicleIdentity(vehicle)}`, metadata: { vehicleId: vehicle.id, componentType: created.componentType, inventoryPartId: created.inventoryPartId, expectedLifeKm: created.expectedLifeKm, expectedLifeDays: created.expectedLifeDays, lastServicedOdometer: created.lastServicedOdometer, alertThresholdKm: created.alertThresholdKm, alertThresholdDays: created.alertThresholdDays } });
      await evaluateVehicleMaintenance(vehicle.id, ctx.fleetopsUser.orgId);
      return created;
    }),
    update: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), inventoryPartId: z2.string().uuid().nullable().optional(), name: z2.string().min(2).optional(), componentType: z2.enum(COMPONENT_CATALOG).optional(), componentSubtype: z2.string().trim().max(120).nullable().optional(), brand: z2.string().trim().max(120).nullable().optional(), partNumber: z2.string().trim().max(120).nullable().optional(), serialNumber: z2.string().trim().max(120).nullable().optional(), installationDate: z2.coerce.date().optional(), expectedLifeKm: z2.number().positive().optional(), expectedLifeDays: z2.number().int().positive().nullable().optional(), lastServicedOdometer: z2.number().nonnegative().optional(), alertThresholdKm: z2.number().positive().optional(), alertThresholdDays: z2.number().int().positive().nullable().optional(), notes: z2.string().trim().max(2e3).nullable().optional(), status: z2.enum(["ACTIVE", "REPLACED", "REMOVED"]).optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC"]);
      assertWritable(ctx.fleetopsUser.org);
      const component = await fleetDb.component.findFirst({ where: { id: input.id, vehicle: { orgId: ctx.fleetopsUser.orgId } } });
      if (!component) throw new TRPCError3({ code: "NOT_FOUND", message: "Component not found." });
      const { id, ...data } = input;
      const updated = await fleetDb.component.update({ where: { id }, data });
      await recordAudit(ctx, { action: Number(updated.lastServicedOdometer) !== Number(component.lastServicedOdometer) ? "COMPONENT_SERVICE_BASELINE_RESET" : "COMPONENT_UPDATED", entityType: "COMPONENT", entityId: updated.id, summary: `Component ${updated.name} updated`, metadata: { vehicleId: updated.vehicleId, componentType: updated.componentType, inventoryPartId: updated.inventoryPartId, previousLastServicedOdometer: component.lastServicedOdometer, lastServicedOdometer: updated.lastServicedOdometer, previousExpectedLifeKm: component.expectedLifeKm, expectedLifeKm: updated.expectedLifeKm, expectedLifeDays: updated.expectedLifeDays, alertThresholdKm: updated.alertThresholdKm, alertThresholdDays: updated.alertThresholdDays, status: updated.status } });
      await evaluateVehicleMaintenance(component.vehicleId, ctx.fleetopsUser.orgId);
      return updated;
    }),
    remove: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const component = await fleetDb.component.findFirst({ where: { id: input.id, vehicle: { orgId: ctx.fleetopsUser.orgId } } });
      if (!component) throw new TRPCError3({ code: "NOT_FOUND", message: "Component not found." });
      const deleted = await fleetDb.component.delete({ where: { id: input.id } });
      await recordAudit(ctx, { action: "COMPONENT_REMOVED", entityType: "COMPONENT", entityId: component.id, summary: `Component ${component.name} removed`, metadata: { vehicleId: component.vehicleId, lastServicedOdometer: component.lastServicedOdometer, expectedLifeKm: component.expectedLifeKm, alertThresholdKm: component.alertThresholdKm } });
      return deleted;
    })
  }),
  vehicles: router({
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "DRIVER"]);
      const where = ctx.fleetopsUser.role === "DRIVER" ? { orgId: ctx.fleetopsUser.orgId, id: { in: await assignedVehicleIds(ctx) } } : { orgId: ctx.fleetopsUser.orgId };
      const vehicleRows = await fleetDb.vehicle.findMany({ where, orderBy: { updatedAt: "desc" } });
      const vehicles2 = await hydrateVehiclesWithComponents(vehicleRows);
      if (!vehicles2.length) return vehicles2;
      const logs = await fleetDb.odometerLog.findMany({ where: { vehicleId: { in: vehicles2.map((vehicle) => vehicle.id) } }, orderBy: { createdAt: "desc" }, take: Math.min(vehicles2.length * 8, 200) });
      const latestByVehicle = /* @__PURE__ */ new Map();
      for (const log of logs) if (!latestByVehicle.has(log.vehicleId)) latestByVehicle.set(log.vehicleId, log);
      return vehicles2.map((vehicle) => {
        const latest = latestByVehicle.get(vehicle.id);
        return { ...vehicle, latestOdometerReading: latest?.reading ?? vehicle.currentOdometer, latestOdometerAt: latest?.createdAt ?? vehicle.updatedAt, latestOdometerSource: latest?.source ?? "VEHICLE_RECORD" };
      });
    }),
    create: fleetOpsProcedure.input(z2.object({ vin: z2.string().trim().min(5).max(32), licensePlate: z2.string().trim().min(3).max(32), chassisNumber: z2.string().trim().max(80).optional(), engineNumber: z2.string().trim().max(80).optional(), vehicleType: z2.enum(["BUS", "MINIBUS", "TRUCK", "VAN", "CAR", "OTHER"]).optional(), assignedRoute: z2.string().trim().max(120).optional(), depotLocation: z2.string().trim().max(120).optional(), make: z2.string().trim().min(2), model: z2.string().trim().min(2), year: z2.number().int().min(1980).max(2100), currentOdometer: z2.number().min(0).default(0), maintenanceTemplate: z2.enum(["NONE", "CITY_BUS"]).default("NONE") })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      await assertVehicleCapacity(ctx.fleetopsUser.orgId, ctx.fleetopsUser.org.maxVehicles);
      const count = await fleetDb.vehicle.count({ where: { orgId: ctx.fleetopsUser.orgId } });
      if (ctx.fleetopsUser.org.subscriptionTier === "TRIAL_FREE" && count >= ctx.fleetopsUser.org.maxVehicles) throw new TRPCError3({ code: "FORBIDDEN", message: "Trial limit reached: maximum 3 vehicles." });
      const { maintenanceTemplate, ...vehicleInput } = input;
      const vin = input.vin.toUpperCase();
      const licensePlate = input.licensePlate.toUpperCase();
      const existingVehicles = await fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } });
      if (existingVehicles.some((item) => String(item.vin).toUpperCase() === vin)) throw new TRPCError3({ code: "CONFLICT", message: "A vehicle with this VIN already exists in the organization." });
      if (existingVehicles.some((item) => String(item.licensePlate).toUpperCase() === licensePlate)) throw new TRPCError3({ code: "CONFLICT", message: "A vehicle with this registration number already exists in the organization." });
      const vehicle = await fleetDb.vehicle.create({ data: { id: crypto.randomUUID(), ...vehicleInput, vin, licensePlate, status: "ACTIVE", orgId: ctx.fleetopsUser.orgId, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() } });
      if (maintenanceTemplate === "CITY_BUS") {
        const odometer = Number(input.currentOdometer ?? 0);
        await Promise.all(CITY_BUS_MAINTENANCE_TEMPLATE.map((template) => fleetDb.component.create({ data: { id: crypto.randomUUID(), vehicleId: vehicle.id, name: template.name, expectedLifeKm: template.expectedLifeKm, lastServicedOdometer: odometer, alertThresholdKm: template.alertThresholdKm } })));
      }
      await recordAudit(ctx, { action: "VEHICLE_CREATED", entityType: "VEHICLE", entityId: vehicle.id, summary: `${vehicleIdentity(vehicle)} added to the fleet`, metadata: { maintenanceTemplate, vin: vehicle.vin, licensePlate: vehicle.licensePlate, vehicleType: vehicle.vehicleType, assignedRoute: vehicle.assignedRoute, depotLocation: vehicle.depotLocation } });
      return { ...vehicle, maintenanceTemplate };
    }),
    update: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), vin: z2.string().trim().min(5).max(32), licensePlate: z2.string().trim().min(3).max(32), chassisNumber: z2.string().trim().max(80).nullable().optional(), engineNumber: z2.string().trim().max(80).nullable().optional(), vehicleType: z2.enum(["BUS", "MINIBUS", "TRUCK", "VAN", "CAR", "OTHER"]).nullable().optional(), assignedRoute: z2.string().trim().max(120).nullable().optional(), depotLocation: z2.string().trim().max(120).nullable().optional(), make: z2.string().trim().min(2), model: z2.string().trim().min(2), year: z2.number().int().min(1980).max(2100), currentOdometer: z2.number().min(0), status: z2.enum(["ACTIVE", "OUT_OF_SERVICE", "MAINTENANCE"]).optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle not found in your organization." });
      const vin = input.vin.toUpperCase();
      const licensePlate = input.licensePlate.toUpperCase();
      const existingVehicles = await fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } });
      if (existingVehicles.some((item) => item.id !== vehicle.id && String(item.vin).toUpperCase() === vin)) throw new TRPCError3({ code: "CONFLICT", message: "Another vehicle already uses this VIN." });
      if (existingVehicles.some((item) => item.id !== vehicle.id && String(item.licensePlate).toUpperCase() === licensePlate)) throw new TRPCError3({ code: "CONFLICT", message: "Another vehicle already uses this registration number." });
      const { id, ...data } = input;
      const updated = await fleetDb.vehicle.update({ where: { id }, data: { ...data, vin, licensePlate } });
      if (Number(input.currentOdometer) > Number(vehicle.currentOdometer)) await evaluateVehicleMaintenance(vehicle.id, ctx.fleetopsUser.orgId);
      await recordAudit(ctx, { action: "VEHICLE_UPDATED", entityType: "VEHICLE", entityId: vehicle.id, summary: `${vehicleIdentity(updated)} details updated`, metadata: { previousOdometer: vehicle.currentOdometer, currentOdometer: updated.currentOdometer, vin: updated.vin, licensePlate: updated.licensePlate } });
      return updated;
    }),
    remove: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle not found in your organization." });
      const deleted = await fleetDb.vehicle.delete({ where: { id: vehicle.id } });
      await recordAudit(ctx, { action: "VEHICLE_DELETED", entityType: "VEHICLE", entityId: vehicle.id, summary: `${vehicleIdentity(vehicle)} deleted from the fleet`, metadata: { vin: vehicle.vin, licensePlate: vehicle.licensePlate } });
      return deleted;
    }),
    odometerHistory: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER"]);
      return fleetDb.odometerLog.findMany({ where: { vehicle: { orgId: ctx.fleetopsUser.orgId } }, include: { vehicle: true }, orderBy: { createdAt: "desc" }, take: 100 });
    }),
    health: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid() })).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "DRIVER"]);
      await assertDriverVehicle(ctx, input.vehicleId);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle not found in your organization scope." });
      const [components2, odometers, workOrderRows, documents2] = await Promise.all([fleetDb.component.findMany({ where: { vehicleId: vehicle.id }, orderBy: { name: "asc" } }), fleetDb.odometerLog.findMany({ where: { vehicleId: vehicle.id, vehicle: { orgId: ctx.fleetopsUser.orgId } }, orderBy: { createdAt: "desc" }, take: 12 }), fleetDb.workOrder.findMany({ where: { vehicleId: vehicle.id, orgId: ctx.fleetopsUser.orgId, ...["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { assignedMechanicId: ctx.fleetopsUser.id } : {} }, orderBy: { updatedAt: "desc" }, take: 12 }), fleetDb.document.findMany({ where: { vehicleId: vehicle.id, orgId: ctx.fleetopsUser.orgId }, orderBy: { expiryDate: "asc" }, take: 12 })]);
      const workOrders2 = await hydrateWorkOrders(workOrderRows, ctx.fleetopsUser.orgId);
      const dueComponents = components2.filter((item) => Number(vehicle.currentOdometer) - Number(item.lastServicedOdometer) >= Number(item.alertThresholdKm));
      const dueDocuments = documents2.filter((item) => new Date(item.expiryDate).getTime() < Date.now() + 30 * 864e5);
      return { vehicle: { ...vehicle, components: components2 }, odometers, workOrders: workOrders2, documents: documents2, health: { componentCount: components2.length, dueComponents: dueComponents.length, openWorkOrders: workOrders2.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status)).length, dueDocuments: dueDocuments.length, readiness: vehicle.status === "ACTIVE" && dueComponents.length === 0 && dueDocuments.length === 0 ? "READY" : "REVIEW" } };
    }),
    updateOdometer: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid(), reading: z2.number().min(0), source: z2.enum(["MANUAL_DRIVER", "GPS_API", "MECHANIC"]) })).mutation(async ({ ctx, input }) => {
      assertWritable(ctx.fleetopsUser.org);
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "DRIVER"]);
      await assertDriverVehicle(ctx, input.vehicleId);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle not found." });
      const current = Number(vehicle.currentOdometer);
      const previousLog = await fleetDb.odometerLog.findFirst({ where: { vehicleId: vehicle.id }, orderBy: { createdAt: "desc" } });
      const elapsedDays = previousLog?.createdAt ? Math.max(1, Math.ceil((Date.now() - new Date(previousLog.createdAt).getTime()) / 864e5)) : 1;
      const baseline = Math.max(current, previousLog ? Number(previousLog.reading) : current);
      validateOdometerReading(baseline, input.reading, elapsedDays);
      const isFlagged = false;
      const [updatedVehicle, odometerLog] = await fleetDb.$transaction([
        fleetDb.vehicle.update({ where: { id: vehicle.id }, data: { currentOdometer: input.reading } }),
        fleetDb.odometerLog.create({ data: { id: crypto.randomUUID(), vehicleId: vehicle.id, driverId: ctx.fleetopsUser.id, reading: input.reading, source: input.source, isFlagged, createdAt: /* @__PURE__ */ new Date() } })
      ]);
      await evaluateVehicleMaintenance(vehicle.id, ctx.fleetopsUser.orgId);
      return { vehicle: updatedVehicle, odometerLog };
    })
  }),
  planning: router({
    maintenance: fleetOpsProcedure.input(z2.object({ from: z2.coerce.date().optional(), to: z2.coerce.date().optional() }).optional()).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const from = input?.from ?? /* @__PURE__ */ new Date();
      const to = input?.to ?? new Date(from.getTime() + 90 * 864e5);
      if (to < from) throw new TRPCError3({ code: "BAD_REQUEST", message: "The planning end date must be on or after the start date." });
      const [vehicleRows, documentRows, workOrderRows] = await Promise.all([
        fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { licensePlate: "asc" } }),
        fleetDb.document.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { expiryDate: "asc" } }),
        fleetDb.workOrder.findMany({ where: { orgId: ctx.fleetopsUser.orgId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_PARTS", "READY_FOR_REVIEW", "REWORK"] } }, orderBy: { updatedAt: "desc" } })
      ]);
      const vehicles2 = await hydrateVehiclesWithComponents(vehicleRows);
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      const documents2 = documentRows.map((document) => ({ ...document, vehicle: document.vehicleId ? vehicleById.get(document.vehicleId) ?? null : null }));
      const workOrders2 = await hydrateWorkOrders(workOrderRows, ctx.fleetopsUser.orgId);
      const items = [
        ...vehicles2.flatMap((vehicle) => (vehicle.components ?? []).filter((component) => Number(vehicle.currentOdometer) - Number(component.lastServicedOdometer) >= Number(component.alertThresholdKm)).map((component) => ({ id: component.id, kind: "COMPONENT_DUE", title: `${component.name} service due`, vehicleId: vehicle.id, vehicleLabel: vehicleIdentity(vehicle), dueDate: /* @__PURE__ */ new Date(), priority: "HIGH", detail: `${Math.max(0, Number(vehicle.currentOdometer) - Number(component.lastServicedOdometer)).toLocaleString("en-IN")} km since last service`, sourceId: component.id }))),
        ...documents2.filter((document) => {
          const due = new Date(document.expiryDate);
          return due >= from && due <= to;
        }).map((document) => ({ id: document.id, kind: "DOCUMENT_EXPIRY", title: `${document.title} expires`, vehicleId: document.vehicleId ?? null, vehicleLabel: document.vehicle ? vehicleIdentity(document.vehicle) : "Organization document", dueDate: new Date(document.expiryDate), priority: new Date(document.expiryDate).getTime() < Date.now() + 30 * 864e5 ? "CRITICAL" : "MEDIUM", detail: `${document.docType ?? "Document"} renewal required`, sourceId: document.id })),
        ...workOrders2.filter((order) => {
          const due = new Date(order.updatedAt ?? order.createdAt);
          return due >= from && due <= to;
        }).map((order) => ({ id: order.id, kind: "WORK_ORDER", title: order.title, vehicleId: order.vehicleId, vehicleLabel: order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId, dueDate: new Date(order.updatedAt ?? order.createdAt), priority: order.priority, detail: `${order.status} \xB7 ${order.assignedMechanic?.fullName ?? "Unassigned"}`, sourceId: order.id }))
      ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      return { from, to, items, counts: { total: items.length, components: items.filter((item) => item.kind === "COMPONENT_DUE").length, documents: items.filter((item) => item.kind === "DOCUMENT_EXPIRY").length, workOrders: items.filter((item) => item.kind === "WORK_ORDER").length } };
    })
  }),
  workOrders: router({
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN"]);
      const where = ["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { orgId: ctx.fleetopsUser.orgId, assignedMechanicId: ctx.fleetopsUser.id } : { orgId: ctx.fleetopsUser.orgId };
      const orders = await fleetDb.workOrder.findMany({ where, orderBy: { createdAt: "desc" } });
      return hydrateWorkOrders(orders, ctx.fleetopsUser.orgId);
    }),
    detail: fleetOpsProcedure.input(z2.object({ workOrderId: z2.string().uuid() })).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "ACCOUNTANT"]);
      const order = await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId, ...["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { assignedMechanicId: ctx.fleetopsUser.id } : {} } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Work order is outside your organization or role scope." });
      const [hydratedRows, vehicleComponents, evidence, activity] = await Promise.all([hydrateWorkOrders([order], ctx.fleetopsUser.orgId), fleetDb.component.findMany({ where: { vehicleId: order.vehicleId }, orderBy: { name: "asc" } }), fleetDb.workOrderEvidence.findMany({ where: { orgId: ctx.fleetopsUser.orgId, workOrderId: order.id }, orderBy: { createdAt: "desc" } }), fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, entityType: "WORK_ORDER", entityId: order.id }, orderBy: { createdAt: "desc" }, take: 100 })]);
      const hydratedOrder = hydratedRows[0];
      return { order: { ...hydratedOrder, vehicle: hydratedOrder.vehicle ? { ...hydratedOrder.vehicle, components: vehicleComponents } : null, evidence }, activity };
    }),
    handoffTimeline: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "ACCOUNTANT"]);
      const where = ["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { orgId: ctx.fleetopsUser.orgId, assignedMechanicId: ctx.fleetopsUser.id } : { orgId: ctx.fleetopsUser.orgId };
      const orderRows = await fleetDb.workOrder.findMany({ where, orderBy: { updatedAt: "desc" }, take: 100 });
      const [orders, events] = await Promise.all([hydrateWorkOrders(orderRows, ctx.fleetopsUser.orgId), fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, entityType: "WORK_ORDER" }, orderBy: { createdAt: "desc" }, take: 500 })]);
      const eventsByOrder = /* @__PURE__ */ new Map();
      for (const event of events) {
        const list = eventsByOrder.get(event.entityId) ?? [];
        if (list.length < 20) list.push(event);
        eventsByOrder.set(event.entityId, list);
      }
      return orders.map((order) => ({ workOrderId: order.id, title: order.title, vehicle: order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId, status: order.status, priority: order.priority, assignedMechanic: order.assignedMechanic?.fullName ?? "Unassigned", updatedAt: order.updatedAt, activity: eventsByOrder.get(order.id) ?? [] }));
    }),
    board: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN"]);
      const where = ["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { orgId: ctx.fleetopsUser.orgId, assignedMechanicId: ctx.fleetopsUser.id } : { orgId: ctx.fleetopsUser.orgId };
      const orderRows = await fleetDb.workOrder.findMany({ where, orderBy: { updatedAt: "desc" } });
      const orders = await hydrateWorkOrders(orderRows, ctx.fleetopsUser.orgId);
      return { columns: ["OPEN", "IN_PROGRESS", "WAITING_FOR_PARTS", "READY_FOR_REVIEW", "REWORK", "COMPLETED", "CANCELLED"].map((status) => ({ status, items: orders.filter((order) => order.status === status) })), totals: { all: orders.length, open: orders.filter((order) => order.status === "OPEN").length, inProgress: orders.filter((order) => order.status === "IN_PROGRESS").length, completed: orders.filter((order) => order.status === "COMPLETED").length } };
    }),
    updateStatus: fleetOpsProcedure.input(z2.object({ workOrderId: z2.string().uuid(), status: z2.enum(["OPEN", "IN_PROGRESS", "WAITING_FOR_PARTS", "READY_FOR_REVIEW", "REWORK", "CANCELLED"]), expectedUpdatedAt: z2.coerce.date().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER", "MECHANIC", "TECHNICIAN"]);
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId, ...["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { assignedMechanicId: ctx.fleetopsUser.id } : {} } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Work order not found in your organization scope." });
      if (input.expectedUpdatedAt && new Date(order.updatedAt).getTime() !== input.expectedUpdatedAt.getTime()) throw new TRPCError3({ code: "CONFLICT", message: "This work order changed elsewhere. Refresh the queue before updating its status." });
      const allowed = { OPEN: ["IN_PROGRESS", "CANCELLED"], IN_PROGRESS: ["WAITING_FOR_PARTS", "READY_FOR_REVIEW", "REWORK", "CANCELLED"], WAITING_FOR_PARTS: ["IN_PROGRESS", "CANCELLED"], READY_FOR_REVIEW: ["COMPLETED", "REWORK"], REWORK: ["IN_PROGRESS", "READY_FOR_REVIEW", "CANCELLED"], COMPLETED: [], CANCELLED: [] };
      const roleAllowed = ctx.fleetopsUser.role === "FLEET_MANAGER" ? ["CANCELLED", "REWORK"] : ["IN_PROGRESS", "WAITING_FOR_PARTS", "READY_FOR_REVIEW", "CANCELLED"];
      if (!allowed[order.status]?.includes(input.status) || !roleAllowed.includes(input.status)) throw new TRPCError3({ code: "FORBIDDEN", message: `Cannot move work order from ${order.status} to ${input.status}; your role is not permitted to perform this transition.` });
      if (input.status === "READY_FOR_REVIEW") {
        const checklistEvents = await fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, entityType: "WORK_ORDER", entityId: order.id, action: "WORK_ORDER_CHECKLIST_UPDATED" }, orderBy: { createdAt: "desc" }, take: 1 });
        let items = [];
        try {
          items = JSON.parse(checklistEvents[0]?.metadata ?? "{}").items ?? [];
        } catch {
          items = [];
        }
        if (!items.length || items.some((item) => !item.completed)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Complete and save every execution checklist item before review." });
      }
      const updated = await fleetDb.workOrder.update({ where: { id: order.id }, data: { status: input.status, ...input.status === "IN_PROGRESS" && !order.startedAt ? { startedAt: /* @__PURE__ */ new Date() } : {} } });
      await recordAudit(ctx, { action: "WORK_ORDER_STATUS_CHANGED", entityType: "WORK_ORDER", entityId: order.id, summary: `Work order moved from ${order.status} to ${input.status}`, metadata: { previousStatus: order.status, nextStatus: input.status } });
      return updated;
    }),
    bulkUpdate: fleetOpsProcedure.input(z2.object({ workOrderIds: z2.array(z2.string().uuid()).min(1).max(100), priority: z2.nativeEnum(Priority).optional(), assignedMechanicId: z2.string().uuid().nullable().optional(), scheduledFor: z2.coerce.date().nullable().optional(), archive: z2.boolean().optional(), cancel: z2.boolean().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      if (!input.priority && input.assignedMechanicId === void 0 && input.scheduledFor === void 0 && input.archive === void 0 && !input.cancel) throw new TRPCError3({ code: "BAD_REQUEST", message: "Choose a priority, assignee, schedule, archive, or cancellation action." });
      if (input.assignedMechanicId) {
        const assignee = await fleetDb.user.findFirst({ where: { id: input.assignedMechanicId, orgId: ctx.fleetopsUser.orgId, role: { in: ["MECHANIC", "TECHNICIAN"] } } });
        if (!assignee) throw new TRPCError3({ code: "BAD_REQUEST", message: "Assignee must belong to this organization." });
      }
      const orders = await fleetDb.workOrder.findMany({ where: { orgId: ctx.fleetopsUser.orgId, id: { in: input.workOrderIds } } });
      if (orders.length !== input.workOrderIds.length) throw new TRPCError3({ code: "NOT_FOUND", message: "One or more work orders are outside this organization." });
      const results = [];
      for (const order of orders) {
        if (input.cancel && ["COMPLETED", "CANCELLED"].includes(order.status)) continue;
        const updated = await fleetDb.workOrder.update({ where: { id: order.id }, data: { ...input.priority ? { priority: input.priority } : {}, ...input.assignedMechanicId !== void 0 ? { assignedMechanicId: input.assignedMechanicId } : {}, ...input.scheduledFor !== void 0 ? { scheduledFor: input.scheduledFor } : {}, ...input.archive !== void 0 ? { archivedAt: input.archive ? /* @__PURE__ */ new Date() : null } : {}, ...input.cancel ? { status: "CANCELLED" } : {} } });
        results.push(updated);
        await recordAudit(ctx, { action: "WORK_ORDER_BULK_UPDATED", entityType: "WORK_ORDER", entityId: order.id, summary: `Bulk work-order update applied to ${order.title}`, metadata: { priority: input.priority, assignedMechanicId: input.assignedMechanicId, cancelled: Boolean(input.cancel), scheduledFor: input.scheduledFor, archived: input.archive } });
      }
      return { updated: results.length, skipped: orders.length - results.length, workOrders: results };
    }),
    assign: fleetOpsProcedure.input(z2.object({ workOrderId: z2.string().uuid(), assignedMechanicId: z2.string().uuid().nullable() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Work order not found in this organization." });
      let assignee = null;
      if (input.assignedMechanicId) {
        assignee = await fleetDb.user.findFirst({ where: { id: input.assignedMechanicId, orgId: ctx.fleetopsUser.orgId, role: { in: ["MECHANIC", "TECHNICIAN"] } } });
        if (!assignee) throw new TRPCError3({ code: "BAD_REQUEST", message: "Owner must be a mechanic or technician in this organization." });
      }
      const updated = await fleetDb.workOrder.update({ where: { id: order.id }, data: { assignedMechanicId: input.assignedMechanicId } });
      await recordAudit(ctx, { action: "WORK_ORDER_ASSIGNED", entityType: "WORK_ORDER", entityId: order.id, summary: `${order.title} assigned to ${assignee?.fullName ?? "unassigned"}`, metadata: { previousAssignedMechanicId: order.assignedMechanicId, assignedMechanicId: input.assignedMechanicId } });
      return updated;
    }),
    startWork: fleetOpsProcedure.input(z2.object({ workOrderId: z2.string().uuid() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["MECHANIC", "TECHNICIAN"]);
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId, assignedMechanicId: ctx.fleetopsUser.id } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Work order is not assigned to you." });
      if (["COMPLETED", "CANCELLED"].includes(order.status)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Closed work orders cannot be started." });
      const started = await fleetDb.workOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS", startedAt: order.startedAt ?? /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "WORK_ORDER_STARTED", entityType: "WORK_ORDER", entityId: order.id, summary: `Work started on ${order.title}`, metadata: { previousStatus: order.status } });
      const managers = await fleetDb.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId, role: { in: ["FLEET_MANAGER", "SUPERADMIN"] } } });
      if (managers.length && fleetDb.notification?.createMany) await fleetDb.notification.createMany({ data: managers.map((manager) => ({ id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, recipientId: manager.id, title: "Work order started", message: `${order.title} is now in progress by ${ctx.fleetopsUser.fullName}.`, type: "WORK_ORDER_STARTED", severity: "INFO", sourceType: "WORK_ORDER", dedupeKey: `WORK_ORDER_STARTED:${order.id}:${ctx.fleetopsUser.id}`, referenceId: order.id, isRead: false, createdAt: /* @__PURE__ */ new Date() })) });
      return started;
    }),
    reservePart: fleetOpsProcedure.input(z2.object({ workOrderId: z2.string().uuid(), partId: z2.string().uuid(), quantity: z2.number().int().positive(), reason: z2.string().trim().min(3).max(300).default("Reserved for work order") })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER", "INVENTORY_MANAGER", "MECHANIC", "TECHNICIAN"]);
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId, ...["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { assignedMechanicId: ctx.fleetopsUser.id } : {} } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Work order not found in your organization scope." });
      const part = await fleetDb.inventoryPart.findFirst({ where: { id: input.partId, orgId: ctx.fleetopsUser.orgId } });
      if (!part) throw new TRPCError3({ code: "NOT_FOUND", message: "Inventory part not found." });
      const [reservations, releases] = await Promise.all([fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, action: "INVENTORY_PART_RESERVED" } }), fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, action: "INVENTORY_PART_RETURNED" } })]);
      const activeReserved = reservations.filter((event) => {
        try {
          const metadata = JSON.parse(event.metadata ?? "{}");
          return metadata.workOrderId === order.id && metadata.partId === part.id && !releases.some((release) => {
            try {
              const released = JSON.parse(release.metadata ?? "{}");
              return released.reservationId === metadata.reservationId;
            } catch {
              return false;
            }
          });
        } catch {
          return false;
        }
      }).reduce((sum, event) => {
        try {
          return sum + Number(JSON.parse(event.metadata ?? "{}").quantity ?? 0);
        } catch {
          return sum;
        }
      }, 0);
      if (Number(part.quantityOnHand) - activeReserved < input.quantity) throw new TRPCError3({ code: "BAD_REQUEST", message: "Insufficient available stock after existing reservations." });
      const reservationId = crypto.randomUUID();
      if (fleetDb.inventoryMovement?.create) await fleetDb.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, workOrderId: order.id, actorId: ctx.fleetopsUser.id, movementType: "RESERVATION", quantity: input.quantity, unitCost: part.unitCost, reason: input.reason, createdAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "INVENTORY_PART_RESERVED", entityType: "WORK_ORDER_PART", entityId: order.id, summary: `Reserved ${input.quantity} ${part.name} for work order`, metadata: { reservationId, workOrderId: order.id, partId: part.id, quantity: input.quantity, reason: input.reason } });
      return { reservationId, workOrderId: order.id, partId: part.id, quantity: input.quantity };
    }),
    returnReservedPart: fleetOpsProcedure.input(z2.object({ reservationId: z2.string().uuid(), quantity: z2.number().int().positive(), reason: z2.string().trim().min(3).max(300).default("Returned unused reserved stock") })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER", "INVENTORY_MANAGER", "MECHANIC", "TECHNICIAN"]);
      assertWritable(ctx.fleetopsUser.org);
      const reservations = await fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, action: "INVENTORY_PART_RESERVED" } });
      const releases = await fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, action: "INVENTORY_PART_RETURNED" } });
      const reservation = reservations.find((event) => {
        try {
          return JSON.parse(event.metadata ?? "{}").reservationId === input.reservationId;
        } catch {
          return false;
        }
      });
      if (!reservation) throw new TRPCError3({ code: "NOT_FOUND", message: "Active part reservation not found." });
      const metadata = JSON.parse(reservation.metadata ?? "{}");
      const returnedQuantity = releases.filter((event) => {
        try {
          return JSON.parse(event.metadata ?? "{}").reservationId === input.reservationId;
        } catch {
          return false;
        }
      }).reduce((sum, event) => {
        try {
          return sum + Number(JSON.parse(event.metadata ?? "{}").quantity ?? 0);
        } catch {
          return sum;
        }
      }, 0);
      if (returnedQuantity >= Number(metadata.quantity)) throw new TRPCError3({ code: "BAD_REQUEST", message: "This part reservation has already been returned." });
      if (input.quantity > Number(metadata.quantity) - returnedQuantity) throw new TRPCError3({ code: "BAD_REQUEST", message: "Return quantity cannot exceed the remaining reserved quantity." });
      const part = await fleetDb.inventoryPart.findFirst({ where: { id: metadata.partId, orgId: ctx.fleetopsUser.orgId } });
      if (!part) throw new TRPCError3({ code: "NOT_FOUND", message: "Reserved part is no longer in this organization." });
      const order = await fleetDb.workOrder.findFirst({ where: { id: metadata.workOrderId, orgId: ctx.fleetopsUser.orgId, ...["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { assignedMechanicId: ctx.fleetopsUser.id } : {} } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Work order is outside your role scope." });
      if (fleetDb.inventoryMovement?.create) await fleetDb.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, workOrderId: order.id, actorId: ctx.fleetopsUser.id, movementType: "RETURN", quantity: input.quantity, unitCost: part.unitCost, reason: input.reason, createdAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "INVENTORY_PART_RETURNED", entityType: "WORK_ORDER_PART", entityId: order.id, summary: `Returned ${input.quantity} ${part.name} from work order reservation`, metadata: { reservationId: input.reservationId, workOrderId: order.id, partId: part.id, quantity: input.quantity, reason: input.reason } });
      return { reservationId: input.reservationId, workOrderId: order.id, partId: part.id, quantity: input.quantity };
    }),
    create: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid(), title: z2.string().min(3), description: z2.string().optional(), priority: z2.nativeEnum(Priority).default(Priority.MEDIUM), assignedMechanicId: z2.string().uuid().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN"]);
      assertWritable(ctx.fleetopsUser.org);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle not found." });
      if (input.assignedMechanicId) {
        const assignee = await fleetDb.user.findFirst({ where: { id: input.assignedMechanicId, orgId: ctx.fleetopsUser.orgId, role: { in: ["MECHANIC", "TECHNICIAN"] } } });
        if (!assignee) throw new TRPCError3({ code: "BAD_REQUEST", message: "Mechanic or Technician must belong to this organization." });
      }
      const created = await fleetDb.workOrder.create({ data: { id: crypto.randomUUID(), ...input, status: "OPEN", orgId: ctx.fleetopsUser.orgId, createdAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "WORK_ORDER_CREATED", entityType: "WORK_ORDER", entityId: created.id, summary: `Work order created: ${created.title}`, metadata: { priority: created.priority, assignedMechanicId: created.assignedMechanicId } });
      return created;
    }),
    update: fleetOpsProcedure.input(z2.object({ workOrderId: z2.string().uuid(), title: z2.string().trim().min(3).max(160).optional(), description: z2.string().trim().max(2e3).nullable().optional(), priority: z2.nativeEnum(Priority).optional(), assignedMechanicId: z2.string().uuid().nullable().optional() }).refine((input) => input.title !== void 0 || input.description !== void 0 || input.priority !== void 0 || input.assignedMechanicId !== void 0, { message: "Provide at least one work-order field to update." })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Work order not found in this organization." });
      if (input.assignedMechanicId) {
        const assignee = await fleetDb.user.findFirst({ where: { id: input.assignedMechanicId, orgId: ctx.fleetopsUser.orgId, role: { in: ["MECHANIC", "TECHNICIAN"] } } });
        if (!assignee) throw new TRPCError3({ code: "BAD_REQUEST", message: "Mechanic or Technician must belong to this organization." });
      }
      const updated = await fleetDb.workOrder.update({ where: { id: order.id }, data: { ...input.title !== void 0 ? { title: input.title } : {}, ...input.description !== void 0 ? { description: input.description } : {}, ...input.priority !== void 0 ? { priority: input.priority } : {}, ...input.assignedMechanicId !== void 0 ? { assignedMechanicId: input.assignedMechanicId } : {} } });
      await recordAudit(ctx, { action: "WORK_ORDER_UPDATED", entityType: "WORK_ORDER", entityId: updated.id, summary: `Updated work order: ${updated.title}`, metadata: { title: input.title, descriptionChanged: input.description !== void 0, priority: input.priority, assignedMechanicId: input.assignedMechanicId ?? null } });
      return updated;
    }),
    complete: fleetOpsProcedure.input(z2.object({ workOrderId: z2.string().uuid(), expectedUpdatedAt: z2.coerce.date().optional(), parts: z2.array(z2.object({ partId: z2.string().uuid(), qtyUsed: z2.number().int().positive() })).default([]), laborHours: z2.number().nonnegative().max(1e3).default(0), repairNotes: z2.string().trim().min(3).max(5e3).default("Completed from organization oversight."), evidence: z2.array(z2.object({ fileData: z2.string().max(6e6), contentType: z2.string().startsWith("image/"), fileName: z2.string().min(1).max(200), caption: z2.string().max(500).optional() })).max(8).default([]) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["MECHANIC", "TECHNICIAN"]);
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId, ...["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { assignedMechanicId: ctx.fleetopsUser.id } : {} }, include: { vehicle: true } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Work order not found." });
      if (input.expectedUpdatedAt && new Date(order.updatedAt).getTime() !== input.expectedUpdatedAt.getTime()) throw new TRPCError3({ code: "CONFLICT", message: "This work order changed elsewhere. Refresh before submitting completion." });
      if (!["IN_PROGRESS", "REWORK"].includes(order.status)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Start work and move the order into execution before submitting completion." });
      const checklistEvents = await fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, entityType: "WORK_ORDER", entityId: order.id, action: "WORK_ORDER_CHECKLIST_UPDATED" }, orderBy: { createdAt: "desc" }, take: 1 });
      let checklistItems = [];
      try {
        checklistItems = JSON.parse(checklistEvents[0]?.metadata ?? "{}").items ?? [];
      } catch {
        checklistItems = [];
      }
      if (!checklistItems.length || checklistItems.some((item) => !item.completed)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Complete and save every execution checklist item before submitting completion." });
      const uploadedEvidence = await Promise.all(input.evidence.map(async (item, index) => {
        const raw = item.fileData.replace(/^data:[^;]+;base64,/, "");
        return { ...item, uploaded: await storagePut(`fleetops/work-orders/${ctx.fleetopsUser.orgId}/${order.id}/${Date.now()}-${index}-${item.fileName}`, Buffer.from(raw, "base64"), item.contentType) };
      }));
      const result = await fleetDb.$transaction(async (tx) => {
        let partsCost = 0;
        for (const requested of input.parts) {
          const part = await tx.inventoryPart.findFirst({ where: { id: requested.partId, orgId: ctx.fleetopsUser.orgId } });
          if (!part || part.quantityOnHand < requested.qtyUsed) throw new TRPCError3({ code: "BAD_REQUEST", message: "Insufficient inventory for one or more parts." });
          partsCost += Number(part.unitCost) * requested.qtyUsed;
          await tx.inventoryPart.update({ where: { id: part.id }, data: { quantityOnHand: { decrement: requested.qtyUsed } } });
          await tx.workOrderPart.create({ data: { id: crypto.randomUUID(), workOrderId: order.id, partId: part.id, qtyUsed: requested.qtyUsed, unitPrice: part.unitCost } });
          if (tx.inventoryMovement?.create) await tx.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, workOrderId: order.id, actorId: ctx.fleetopsUser.id, movementType: "ISSUE", quantity: -requested.qtyUsed, unitCost: part.unitCost, reason: `Consumed for work order ${order.id}`, createdAt: /* @__PURE__ */ new Date() } });
        }
        const completed = await tx.workOrder.update({ where: { id: order.id }, data: { status: "READY_FOR_REVIEW", startedAt: order.startedAt ?? /* @__PURE__ */ new Date(), completedAt: null, laborHours: input.laborHours, repairNotes: input.repairNotes } });
        for (const item of uploadedEvidence) await tx.workOrderEvidence.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, workOrderId: order.id, uploadedById: ctx.fleetopsUser.id, fileUrl: item.uploaded.url, ...item.uploaded.key ? { fileKey: item.uploaded.key } : {}, ...item.caption ? { caption: item.caption } : {}, createdAt: /* @__PURE__ */ new Date() } });
        const approvers = await tx.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId, role: { in: ["SUPERADMIN", "FLEET_MANAGER"] } } });
        if (approvers.length) await tx.notification.createMany({ data: approvers.map((approver) => ({ id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, recipientId: approver.id, title: "Work order ready for review", message: `${order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId} repair is ready for approval. Parts cost: \u20B9${partsCost.toLocaleString("en-IN")}.`, type: "WORK_ORDER_REVIEW", severity: "HIGH", sourceType: "WORK_ORDER", dedupeKey: `WORK_ORDER_REVIEW:${order.id}:${approver.id}`, referenceId: order.id, isRead: false, createdAt: /* @__PURE__ */ new Date() })) });
        return { completed, partsCost };
      });
      await recordAudit(ctx, { action: "WORK_ORDER_READY_FOR_REVIEW", entityType: "WORK_ORDER", entityId: order.id, summary: `Work order ready for review for ${order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId}`, metadata: { partsCost: result.partsCost, laborHours: input.laborHours, evidenceCount: input.evidence.length } });
      await evaluateLowInventory(ctx.fleetopsUser.orgId);
      return result;
    }),
    updateChecklist: fleetOpsProcedure.input(z2.object({ workOrderId: z2.string().uuid(), items: z2.array(z2.object({ id: z2.string().min(1).max(80), title: z2.string().trim().min(2).max(160), completed: z2.boolean() })).min(1).max(30) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["MECHANIC", "TECHNICIAN"]);
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId, assignedMechanicId: ctx.fleetopsUser.id } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Work order is not assigned to you." });
      await recordAudit(ctx, { action: "WORK_ORDER_CHECKLIST_UPDATED", entityType: "WORK_ORDER", entityId: order.id, summary: `Checklist updated for ${order.title}`, metadata: { items: input.items } });
      return { workOrderId: order.id, items: input.items };
    }),
    approve: fleetOpsProcedure.input(z2.object({ workOrderId: z2.string().uuid() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId, status: "READY_FOR_REVIEW" }, include: { vehicle: true, partsUsed: true } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Only work orders ready for review can be approved." });
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: order.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "The work order vehicle is not available in this organization." });
      const latestOdometer = await fleetDb.odometerLog.findFirst({ where: { vehicleId: order.vehicleId }, orderBy: { createdAt: "desc" } });
      const serviceOdometer = latestOdometer?.reading ?? vehicle.currentOdometer;
      const checklistEvents = await fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, entityType: "WORK_ORDER", entityId: order.id, action: "WORK_ORDER_CHECKLIST_UPDATED" }, orderBy: { createdAt: "desc" }, take: 1 });
      let items = [];
      try {
        items = JSON.parse(checklistEvents[0]?.metadata ?? "{}").items ?? [];
      } catch {
        items = [];
      }
      if (!items.length || items.some((item) => !item.completed)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Complete every execution checklist item before approval." });
      const recordedParts = await fleetDb.workOrderPart.findMany({ where: { workOrderId: order.id } });
      const partsCost = recordedParts.reduce((sum, part) => sum + Number(part.unitPrice ?? 0) * Number(part.qtyUsed ?? 0), 0);
      const reservations = await fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, action: "INVENTORY_PART_RESERVED" } });
      const returns = await fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, action: "INVENTORY_PART_RETURNED" } });
      const activeReservations = reservations.map((event) => {
        try {
          return JSON.parse(event.metadata ?? "{}");
        } catch {
          return null;
        }
      }).filter((metadata) => metadata?.workOrderId === order.id).filter((metadata) => {
        const returned = returns.reduce((sum, event) => {
          try {
            const data = JSON.parse(event.metadata ?? "{}");
            return data.reservationId === metadata.reservationId ? sum + Number(data.quantity ?? 0) : sum;
          } catch {
            return sum;
          }
        }, 0);
        return returned < Number(metadata.quantity ?? 0);
      });
      const reservedPartRows = activeReservations.length ? await fleetDb.inventoryPart.findMany({ where: { orgId: ctx.fleetopsUser.orgId, id: { in: activeReservations.map((metadata) => metadata.partId) } } }) : [];
      const reservedPartsCost = activeReservations.reduce((sum, metadata) => {
        const part = reservedPartRows.find((row) => row.id === metadata.partId);
        const returned = returns.reduce((total, event) => {
          try {
            const data = JSON.parse(event.metadata ?? "{}");
            return data.reservationId === metadata.reservationId ? total + Number(data.quantity ?? 0) : total;
          } catch {
            return total;
          }
        }, 0);
        return sum + Math.max(0, Number(metadata.quantity ?? 0) - returned) * Number(part?.unitCost ?? 0);
      }, 0);
      const settings = await fleetDb.organizationSetting.findFirst({ where: { orgId: ctx.fleetopsUser.orgId } });
      const laborRatePerHour = Number(settings?.laborRatePerHour ?? 0);
      const laborCost = laborRatePerHour > 0 && Number(order.laborHours ?? 0) > 0 ? laborRatePerHour * Number(order.laborHours) : 0;
      const approved = await fleetDb.$transaction(async (tx) => {
        const completed = await tx.workOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", completedAt: /* @__PURE__ */ new Date() } });
        for (const metadata of activeReservations) {
          const returned = returns.reduce((sum, event) => {
            try {
              const data = JSON.parse(event.metadata ?? "{}");
              return data.reservationId === metadata.reservationId ? sum + Number(data.quantity ?? 0) : sum;
            } catch {
              return sum;
            }
          }, 0);
          const quantityToConsume = Number(metadata.quantity ?? 0) - returned;
          const part = reservedPartRows.find((row) => row.id === metadata.partId);
          if (!part || quantityToConsume <= 0) continue;
          const changed = await tx.inventoryPart.updateMany({ where: { id: part.id, orgId: ctx.fleetopsUser.orgId, quantityOnHand: { gte: quantityToConsume } }, data: { quantityOnHand: { decrement: quantityToConsume } } });
          if (!changed.count) throw new TRPCError3({ code: "CONFLICT", message: `Insufficient stock to consume reserved part ${part.name}.` });
          await tx.workOrderPart.create({ data: { id: crypto.randomUUID(), workOrderId: order.id, partId: part.id, qtyUsed: quantityToConsume, unitPrice: part.unitCost } });
          if (tx.inventoryMovement?.create) await tx.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, workOrderId: order.id, actorId: ctx.fleetopsUser.id, movementType: "ISSUE", quantity: -quantityToConsume, unitCost: part.unitCost, reason: `Consumed for approved work order ${order.id}`, createdAt: /* @__PURE__ */ new Date() } });
        }
        const components2 = await tx.component.findMany({ where: { vehicleId: order.vehicleId } });
        const matching = components2.filter((component) => order.title.toLowerCase().includes(String(component.name).toLowerCase()));
        for (const component of matching) await tx.component.update({ where: { id: component.id }, data: { lastServicedOdometer: serviceOdometer } });
        if (matching.length && vehicle.status === "MAINTENANCE") await tx.vehicle.update({ where: { id: order.vehicleId }, data: { status: "ACTIVE" } });
        if (partsCost + reservedPartsCost > 0 && tx.financialRecord?.create) await tx.financialRecord.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, vehicleId: order.vehicleId, type: "EXPENSE", category: "MAINTENANCE_PARTS", amount: partsCost + reservedPartsCost, transactionDate: /* @__PURE__ */ new Date(), costCenterType: "WORK_ORDER", costCenterId: order.id, vendor: "Inventory", approvalStatus: "APPROVED", approvedById: ctx.fleetopsUser.id, approvalReason: `Approved parts used for ${order.title}`, createdAt: /* @__PURE__ */ new Date() } });
        if (laborCost > 0 && tx.financialRecord?.create) await tx.financialRecord.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, vehicleId: order.vehicleId, type: "EXPENSE", category: "MAINTENANCE_LABOR", amount: laborCost, transactionDate: /* @__PURE__ */ new Date(), costCenterType: "WORK_ORDER", costCenterId: order.id, vendor: "Internal labor", approvalStatus: "APPROVED", approvedById: ctx.fleetopsUser.id, approvalReason: `Labor cost for ${order.title} at \u20B9${laborRatePerHour.toLocaleString("en-IN")}/hour`, createdAt: /* @__PURE__ */ new Date() } });
        return { completed, servicedComponents: matching.length, partsCost: partsCost + reservedPartsCost, laborCost };
      });
      await recordAudit(ctx, { action: "WORK_ORDER_APPROVED", entityType: "WORK_ORDER", entityId: order.id, summary: `Work order approved and completed: ${order.title}`, metadata: { checklistItems: items.length, servicedComponents: approved.servicedComponents, partsCost: approved.partsCost, laborCost: approved.laborCost, laborRatePerHour, reservedPartsConsumed: activeReservations.length } });
      return approved.completed;
    })
  }),
  inventory: router({
    get: fleetOpsProcedure.input(z2.object({ partId: z2.string().uuid() })).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      const part = await fleetDb.inventoryPart.findFirst({ where: { id: input.partId, orgId: ctx.fleetopsUser.orgId } });
      if (!part) throw new TRPCError3({ code: "NOT_FOUND", message: "Inventory part not found." });
      const movements = await fleetDb.inventoryMovement.findMany({ where: { orgId: ctx.fleetopsUser.orgId, partId: part.id }, orderBy: { createdAt: "desc" }, take: 100 });
      const reserved = movements.filter((movement) => movement.movementType === "RESERVATION" && Number(movement.quantity) > 0).reduce((sum, movement) => sum + Number(movement.quantity), 0);
      const released = movements.filter((movement) => movement.movementType === "RELEASE" || movement.movementType === "ISSUE").reduce((sum, movement) => sum + Math.abs(Number(movement.quantity)), 0);
      return { part, movements, reserved: Math.max(0, reserved - released), available: Math.max(0, Number(part.quantityOnHand) - Math.max(0, reserved - released)) };
    }),
    list: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      return fleetDb.inventoryPart.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { name: "asc" } });
    }),
    references: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN"]);
      return fleetDb.inventoryPart.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, select: { id: true, sku: true, name: true }, orderBy: { name: "asc" } });
    }),
    movements: fleetOpsProcedure.input(z2.object({ partId: z2.string().uuid().optional(), workOrderId: z2.string().uuid().optional() }).optional()).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER", "MECHANIC", "TECHNICIAN"]);
      const filters = { ...input?.partId ? { partId: input.partId } : {}, ...input?.workOrderId ? { workOrderId: input.workOrderId } : {} };
      if (ctx.fleetopsUser.role === "SUPERADMIN" || ctx.fleetopsUser.role === "INVENTORY_MANAGER") return fleetDb.inventoryMovement.findMany({ where: { orgId: ctx.fleetopsUser.orgId, ...filters }, orderBy: { createdAt: "desc" }, take: 100 });
      const assignedOrders = await fleetDb.workOrder.findMany({ where: { orgId: ctx.fleetopsUser.orgId, assignedMechanicId: ctx.fleetopsUser.id }, select: { id: true } });
      return fleetDb.inventoryMovement.findMany({ where: { orgId: ctx.fleetopsUser.orgId, workOrderId: { in: assignedOrders.map((order) => order.id) }, ...input?.partId ? { partId: input.partId } : {}, ...input?.workOrderId ? { workOrderId: input.workOrderId } : {} }, orderBy: { createdAt: "desc" }, take: 100 });
    }),
    create: fleetOpsProcedure.input(z2.object({ sku: z2.string().min(1), name: z2.string().min(2), binLocation: z2.string().optional(), quantityOnHand: z2.number().int().nonnegative(), minReorderLevel: z2.number().int().nonnegative().default(5), unitCost: z2.number().nonnegative() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const part = await fleetDb.inventoryPart.create({ data: { id: crypto.randomUUID(), ...input, orgId: ctx.fleetopsUser.orgId } });
      if (input.quantityOnHand > 0 && fleetDb.inventoryMovement?.create) await fleetDb.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, actorId: ctx.fleetopsUser.id, movementType: "RECEIPT", quantity: input.quantityOnHand, unitCost: input.unitCost, reason: "Opening inventory balance", createdAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "INVENTORY_PART_CREATED", entityType: "INVENTORY_PART", entityId: part.id, summary: `Inventory part created: ${part.name}`, metadata: { openingQuantity: input.quantityOnHand } });
      await evaluateLowInventory(ctx.fleetopsUser.orgId);
      return part;
    }),
    receive: fleetOpsProcedure.input(z2.object({ partId: z2.string().uuid(), quantity: z2.number().int().positive(), unitCost: z2.number().nonnegative().optional(), reason: z2.string().min(3).max(300) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const part = await fleetDb.inventoryPart.findFirst({ where: { id: input.partId, orgId: ctx.fleetopsUser.orgId } });
      if (!part) throw new TRPCError3({ code: "NOT_FOUND", message: "Inventory part not found." });
      const updated = await fleetDb.$transaction(async (tx) => {
        const next = await tx.inventoryPart.update({ where: { id: part.id }, data: { quantityOnHand: { increment: input.quantity }, ...input.unitCost !== void 0 ? { unitCost: input.unitCost } : {} } });
        if (tx.inventoryMovement?.create) await tx.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, actorId: ctx.fleetopsUser.id, movementType: "RECEIPT", quantity: input.quantity, unitCost: input.unitCost ?? part.unitCost, reason: input.reason, createdAt: /* @__PURE__ */ new Date() } });
        return next;
      });
      await recordAudit(ctx, { action: "INVENTORY_RECEIVED", entityType: "INVENTORY_PART", entityId: part.id, summary: `Received ${input.quantity} units of ${part.name}`, metadata: { quantity: input.quantity, reason: input.reason } });
      return updated;
    }),
    issue: fleetOpsProcedure.input(z2.object({ partId: z2.string().uuid(), quantity: z2.number().int().positive(), reason: z2.string().min(3).max(300), workOrderId: z2.string().uuid().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER", "MECHANIC", "TECHNICIAN"]);
      assertWritable(ctx.fleetopsUser.org);
      const part = await fleetDb.inventoryPart.findFirst({ where: { id: input.partId, orgId: ctx.fleetopsUser.orgId } });
      if (!part) throw new TRPCError3({ code: "NOT_FOUND", message: "Inventory part not found." });
      if ((ctx.fleetopsUser.role === "MECHANIC" || ctx.fleetopsUser.role === "TECHNICIAN") && !input.workOrderId) throw new TRPCError3({ code: "BAD_REQUEST", message: "Mechanics and Technicians must link issued parts to an assigned work order." });
      const workOrder = input.workOrderId ? await fleetDb.workOrder.findFirst({ where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId, status: { notIn: ["COMPLETED", "CANCELLED"] }, ...ctx.fleetopsUser.role === "MECHANIC" || ctx.fleetopsUser.role === "TECHNICIAN" ? { assignedMechanicId: ctx.fleetopsUser.id } : {} } }) : null;
      if (input.workOrderId && !workOrder) throw new TRPCError3({ code: "BAD_REQUEST", message: "Work order is not active or is outside your assigned maintenance scope." });
      if (part.quantityOnHand < input.quantity) throw new TRPCError3({ code: "BAD_REQUEST", message: "Insufficient inventory for this issue." });
      const updated = await fleetDb.$transaction(async (tx) => {
        const changed = await tx.inventoryPart.updateMany({ where: { id: part.id, orgId: ctx.fleetopsUser.orgId, quantityOnHand: { gte: input.quantity } }, data: { quantityOnHand: { decrement: input.quantity } } });
        if (!changed.count) throw new TRPCError3({ code: "CONFLICT", message: "Inventory changed while this part was being issued. Refresh the balance and retry." });
        const next = await tx.inventoryPart.findFirst({ where: { id: part.id, orgId: ctx.fleetopsUser.orgId } });
        if (tx.inventoryMovement?.create) await tx.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, workOrderId: input.workOrderId, actorId: ctx.fleetopsUser.id, movementType: "ISSUE", quantity: -input.quantity, unitCost: part.unitCost, reason: input.reason, createdAt: /* @__PURE__ */ new Date() } });
        return next;
      });
      await recordAudit(ctx, { action: "INVENTORY_ISSUED", entityType: "INVENTORY_PART", entityId: part.id, summary: `Issued ${input.quantity} units of ${part.name}`, metadata: { quantity: input.quantity, reason: input.reason, workOrderId: input.workOrderId ?? null } });
      await evaluateLowInventory(ctx.fleetopsUser.orgId);
      return updated;
    }),
    transfer: fleetOpsProcedure.input(z2.object({ partId: z2.string().uuid(), toBinLocation: z2.string().trim().min(1).max(80), reason: z2.string().trim().min(3).max(300) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const part = await fleetDb.inventoryPart.findFirst({ where: { id: input.partId, orgId: ctx.fleetopsUser.orgId } });
      if (!part) throw new TRPCError3({ code: "NOT_FOUND", message: "Inventory part not found." });
      const updated = await fleetDb.$transaction(async (tx) => {
        const next = await tx.inventoryPart.update({ where: { id: part.id }, data: { binLocation: input.toBinLocation } });
        if (tx.inventoryMovement?.create) await tx.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, actorId: ctx.fleetopsUser.id, movementType: "TRANSFER", quantity: 0, unitCost: part.unitCost, reason: `${part.binLocation ?? "Unassigned"} \u2192 ${input.toBinLocation}: ${input.reason}`, createdAt: /* @__PURE__ */ new Date() } });
        return next;
      });
      await recordAudit(ctx, { action: "INVENTORY_TRANSFERRED", entityType: "INVENTORY_PART", entityId: part.id, summary: `Transferred ${part.name} to ${input.toBinLocation}`, metadata: { fromBinLocation: part.binLocation, toBinLocation: input.toBinLocation, reason: input.reason } });
      return updated;
    }),
    adjust: fleetOpsProcedure.input(z2.object({ partId: z2.string().uuid(), expectedQuantityOnHand: z2.number().int().nonnegative(), delta: z2.number().int(), reason: z2.string().trim().min(3).max(300) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const part = await fleetDb.inventoryPart.findFirst({ where: { id: input.partId, orgId: ctx.fleetopsUser.orgId } });
      if (!part) throw new TRPCError3({ code: "NOT_FOUND", message: "Inventory part not found." });
      const nextQuantity = input.expectedQuantityOnHand + input.delta;
      if (nextQuantity < 0) throw new TRPCError3({ code: "BAD_REQUEST", message: "Inventory adjustments cannot produce a negative balance." });
      const updated = await fleetDb.$transaction(async (tx) => {
        const changed = await tx.inventoryPart.updateMany({ where: { id: part.id, orgId: ctx.fleetopsUser.orgId, quantityOnHand: input.expectedQuantityOnHand }, data: { quantityOnHand: nextQuantity } });
        if (!changed.count) throw new TRPCError3({ code: "CONFLICT", message: "Inventory changed since it was loaded. Refresh the balance and retry." });
        if (tx.inventoryMovement?.create) await tx.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, actorId: ctx.fleetopsUser.id, movementType: "ADJUSTMENT", quantity: input.delta, unitCost: part.unitCost, reason: input.reason, createdAt: /* @__PURE__ */ new Date() } });
        return tx.inventoryPart.findFirst({ where: { id: part.id, orgId: ctx.fleetopsUser.orgId } });
      });
      await recordAudit(ctx, { action: "INVENTORY_ADJUSTED", entityType: "INVENTORY_PART", entityId: part.id, summary: `Adjusted ${part.name} by ${input.delta}`, metadata: { expectedQuantityOnHand: input.expectedQuantityOnHand, nextQuantity, reason: input.reason } });
      await evaluateLowInventory(ctx.fleetopsUser.orgId);
      return updated;
    }),
    exportCsv: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      const rows = await fleetDb.inventoryPart.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { sku: "asc" } });
      const csv = csvDocument(rows.map((row) => ({ sku: row.sku, name: row.name, binLocation: row.binLocation ?? "", quantityOnHand: row.quantityOnHand, minReorderLevel: row.minReorderLevel, unitCostInr: Number(row.unitCost).toFixed(2) })), ["sku", "name", "binLocation", "quantityOnHand", "minReorderLevel", "unitCostInr"]);
      await recordAudit(ctx, { action: "INVENTORY_EXPORT_CSV", entityType: "INVENTORY_PART", summary: `Exported ${rows.length} inventory parts`, metadata: { count: rows.length } });
      return { filename: `fleetops-inventory-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`, content: csv, rowCount: rows.length };
    }),
    previewImport: fleetOpsProcedure.input(z2.object({ csv: z2.string().max(1e6) })).query(({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      const parsed = parseInventoryCsv(input.csv);
      return { rowCount: parsed.rows.length, validCount: parsed.rows.filter((row) => !row.errors.length).length, errors: parsed.errors, rows: parsed.rows.slice(0, 100).map((item) => ({ rowNumber: item.rowNumber, ...item.row, errors: item.errors })) };
    }),
    importCsv: fleetOpsProcedure.input(z2.object({ csv: z2.string().max(1e6) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const parsed = parseInventoryCsv(input.csv);
      if (parsed.errors.length) throw new TRPCError3({ code: "BAD_REQUEST", message: parsed.errors.slice(0, 8).join("; ") });
      const existing = await fleetDb.inventoryPart.findMany({ where: { orgId: ctx.fleetopsUser.orgId } });
      const seen = new Set(existing.map((part) => part.sku.toUpperCase()));
      const candidates = parsed.rows.filter((item) => {
        const sku = String(item.row.sku).toUpperCase();
        if (seen.has(sku)) return false;
        seen.add(sku);
        return true;
      });
      if (candidates.length !== parsed.rows.length) throw new TRPCError3({ code: "CONFLICT", message: "Every SKU must be unique and must not already exist in this organization." });
      const created = await Promise.all(candidates.map((item) => fleetDb.inventoryPart.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, sku: item.row.sku, name: item.row.name, binLocation: item.row.binLocation || void 0, quantityOnHand: Number(item.row.quantityOnHand), minReorderLevel: Number(item.row.minReorderLevel), unitCost: Number(item.row.unitCost ?? item.row.unitCostInr) } })));
      await recordAudit(ctx, { action: "INVENTORY_IMPORT_CSV", entityType: "INVENTORY_PART", summary: `Imported ${created.length} inventory parts`, metadata: { count: created.length } });
      return { importedCount: created.length };
    })
  }),
  driver: router({
    inspections: fleetOpsProcedure.query(async ({ ctx }) => fleetDb.dvirInspection.findMany({ where: { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id }, orderBy: { createdAt: "desc" }, take: 50 })),
    createInspection: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid(), inspectionType: z2.enum(["PRE_TRIP", "POST_TRIP"]), status: z2.enum(["PASS", "FAIL"]), notes: z2.string().max(2e3).optional(), photoData: z2.string().max(2e6).optional(), photoContentType: z2.string().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["DRIVER", "SUPERADMIN"]);
      assertWritable(ctx.fleetopsUser.org);
      await assertDriverVehicle(ctx, input.vehicleId);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle not found." });
      let photoUrl;
      let photoKey;
      if (input.photoData) {
        const raw = input.photoData.replace(/^data:[^;]+;base64,/, "");
        const uploaded = await storagePut(`fleetops/dvir/${ctx.fleetopsUser.orgId}/${vehicle.id}.jpg`, Buffer.from(raw, "base64"), input.photoContentType ?? "image/jpeg");
        photoUrl = uploaded.url;
        photoKey = uploaded.key;
      }
      return fleetDb.dvirInspection.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, vehicleId: vehicle.id, driverId: ctx.fleetopsUser.id, inspectionType: input.inspectionType, status: input.status, notes: input.notes, photoUrl, photoKey, createdAt: /* @__PURE__ */ new Date() } });
    }),
    fuelLogs: fleetOpsProcedure.query(({ ctx }) => fleetDb.fuelLog.findMany({ where: { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id }, orderBy: { createdAt: "desc" }, take: 50 })),
    createFuelLog: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid(), liters: z2.number().positive(), amount: z2.number().nonnegative(), odometer: z2.number().nonnegative(), station: z2.string().max(200).optional(), receiptData: z2.string().max(2e6).optional(), receiptContentType: z2.string().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["DRIVER", "SUPERADMIN"]);
      assertWritable(ctx.fleetopsUser.org);
      await assertDriverVehicle(ctx, input.vehicleId);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle not found." });
      const previousLog = await fleetDb.odometerLog.findFirst({ where: { vehicleId: vehicle.id }, orderBy: { createdAt: "desc" } });
      const elapsedDays = previousLog?.createdAt ? Math.max(1, Math.ceil((Date.now() - new Date(previousLog.createdAt).getTime()) / 864e5)) : 1;
      validateOdometerReading(previousLog ? Number(previousLog.reading) : Number(vehicle.currentOdometer), input.odometer, elapsedDays);
      let receiptUrl;
      if (input.receiptData) receiptUrl = (await storagePut(`fleetops/fuel/${ctx.fleetopsUser.orgId}/${vehicle.id}.jpg`, Buffer.from(input.receiptData.replace(/^data:[^;]+;base64,/, ""), "base64"), input.receiptContentType ?? "image/jpeg")).url;
      const [log] = await fleetDb.$transaction([fleetDb.fuelLog.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, vehicleId: vehicle.id, driverId: ctx.fleetopsUser.id, liters: input.liters, amount: input.amount, odometer: input.odometer, station: input.station, receiptUrl, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() } }), fleetDb.financialRecord.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, vehicleId: vehicle.id, type: "EXPENSE", category: "FUEL", amount: input.amount, transactionDate: /* @__PURE__ */ new Date() } }), fleetDb.odometerLog.create({ data: { id: crypto.randomUUID(), vehicleId: vehicle.id, driverId: ctx.fleetopsUser.id, reading: input.odometer, source: "MANUAL_DRIVER", isFlagged: false, createdAt: /* @__PURE__ */ new Date() } }), fleetDb.vehicle.update({ where: { id: vehicle.id }, data: { currentOdometer: input.odometer } })]);
      await evaluateVehicleMaintenance(vehicle.id, ctx.fleetopsUser.orgId);
      return log;
    }),
    dailyHome: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["DRIVER"]);
      const assignments = await fleetDb.vehicleAssignment.findMany({ where: { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id, active: true } });
      const assigned = assignments[0];
      if (!assigned) return { vehicle: null, readiness: "UNASSIGNED", latestInspection: null, openIssues: [], nextAction: "Contact Fleet Manager for an active vehicle assignment." };
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: assigned.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      const latestOdometer = await fleetDb.odometerLog.findFirst({ where: { vehicleId: assigned.vehicleId }, orderBy: { createdAt: "desc" } });
      const inspections = await fleetDb.dvirInspection.findMany({ where: { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id, vehicleId: assigned.vehicleId }, orderBy: { createdAt: "desc" }, take: 10 });
      const openIssues = await fleetDb.vehicleIssue.findMany({ where: { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id, vehicleId: assigned.vehicleId, status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] } }, orderBy: { createdAt: "desc" }, take: 20 });
      const latestInspection = inspections[0] ?? null;
      const readiness = vehicle?.status === "OUT_OF_SERVICE" ? "UNSAFE" : latestInspection?.inspectionType === "PRE_TRIP" && latestInspection.status === "PASS" && !openIssues.some((issue) => ["HIGH", "CRITICAL"].includes(issue.priority)) ? "READY" : "ACTION_REQUIRED";
      const canonicalVehicle = vehicle ? { ...vehicle, currentOdometer: latestOdometer?.reading ?? vehicle.currentOdometer, latestOdometerReading: latestOdometer?.reading ?? vehicle.currentOdometer, latestOdometerAt: latestOdometer?.createdAt ?? vehicle.updatedAt, latestOdometerSource: latestOdometer?.source ?? "VEHICLE_RECORD" } : null;
      return { vehicle: canonicalVehicle, readiness, latestInspection, openIssues, nextAction: readiness === "READY" ? "Vehicle cleared for shift." : readiness === "UNSAFE" ? "Do not drive. Fleet Manager disposition required." : "Complete a passing pre-trip inspection and resolve high-priority issues." };
    }),
    unsafeDisposition: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid(), disposition: z2.enum(["UNSAFE_TO_DRIVE", "CLEARED_TO_DRIVE"]), notes: z2.string().trim().min(3).max(1e3) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["DRIVER"]);
      assertWritable(ctx.fleetopsUser.org);
      await assertDriverVehicle(ctx, input.vehicleId);
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Assigned vehicle not found." });
      const nextStatus = input.disposition === "UNSAFE_TO_DRIVE" ? "OUT_OF_SERVICE" : "ACTIVE";
      const updated = await fleetDb.vehicle.update({ where: { id: vehicle.id }, data: { status: nextStatus } });
      const managers = await fleetDb.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId, role: "FLEET_MANAGER" } });
      if (managers.length) await fleetDb.notification.createMany({ data: managers.map((manager) => ({ id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, recipientId: manager.id, title: input.disposition === "UNSAFE_TO_DRIVE" ? "Driver marked vehicle unsafe" : "Driver cleared vehicle", message: `${vehicleIdentity(vehicle)}: ${input.notes}`, type: "DRIVER_SAFETY_DISPOSITION", severity: input.disposition === "UNSAFE_TO_DRIVE" ? "CRITICAL" : "INFO", sourceType: "VEHICLE", dedupeKey: `DRIVER_SAFETY:${vehicle.id}:${input.disposition}`, referenceId: vehicle.id, isRead: false, createdAt: /* @__PURE__ */ new Date() })) });
      await recordAudit(ctx, { action: "DRIVER_SAFETY_DISPOSITION", entityType: "VEHICLE", entityId: vehicle.id, summary: `${vehicleIdentity(vehicle)} marked ${input.disposition}`, metadata: { disposition: input.disposition, notes: input.notes } });
      return updated;
    })
  }),
  vehicleIssues: router({
    list: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "DRIVER"]);
      const where = ctx.fleetopsUser.role === "DRIVER" ? { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id } : { orgId: ctx.fleetopsUser.orgId };
      return fleetDb.vehicleIssue.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
    }),
    create: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid(), title: z2.string().trim().min(3).max(160), description: z2.string().trim().min(5).max(4e3), priority: z2.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"), photoData: z2.string().max(4e6).optional(), photoContentType: z2.string().startsWith("image/").optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["DRIVER"]);
      assertWritable(ctx.fleetopsUser.org);
      await assertDriverVehicle(ctx, input.vehicleId);
      let photoUrl;
      let photoKey;
      if (input.photoData) {
        const uploaded = await storagePut(`fleetops/vehicle-issues/${ctx.fleetopsUser.orgId}/${input.vehicleId}/${Date.now()}.jpg`, Buffer.from(input.photoData.replace(/^data:[^;]+;base64,/, ""), "base64"), input.photoContentType ?? "image/jpeg");
        photoUrl = uploaded.url;
        photoKey = uploaded.key;
      }
      const issue = await fleetDb.vehicleIssue.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, vehicleId: input.vehicleId, driverId: ctx.fleetopsUser.id, title: input.title, description: input.description, priority: input.priority, status: "OPEN", photoUrl, photoKey, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() } });
      const managers = await fleetDb.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId, role: "FLEET_MANAGER" } });
      if (managers.length) await fleetDb.notification.createMany({ data: managers.map((manager) => ({ id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, recipientId: manager.id, title: "Driver vehicle issue reported", message: `${input.title} \xB7 ${input.priority} priority`, type: "VEHICLE_ISSUE", severity: input.priority === "CRITICAL" ? "CRITICAL" : input.priority === "HIGH" ? "HIGH" : "INFO", sourceType: "VEHICLE_ISSUE", dedupeKey: `VEHICLE_ISSUE:${issue.id}`, referenceId: issue.id, isRead: false, createdAt: /* @__PURE__ */ new Date() })) });
      await recordAudit(ctx, { action: "VEHICLE_ISSUE_REPORTED", entityType: "VEHICLE_ISSUE", entityId: issue.id, summary: `Driver reported vehicle issue: ${issue.title}`, metadata: { priority: issue.priority } });
      return issue;
    }),
    updateStatus: fleetOpsProcedure.input(z2.object({ issueId: z2.string().uuid(), status: z2.enum(["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED"]) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const issue = await fleetDb.vehicleIssue.findFirst({ where: { id: input.issueId, orgId: ctx.fleetopsUser.orgId } });
      if (!issue) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle issue not found in this organization." });
      const updated = await fleetDb.vehicleIssue.update({ where: { id: issue.id }, data: { status: input.status } });
      await recordAudit(ctx, { action: "VEHICLE_ISSUE_STATUS_CHANGED", entityType: "VEHICLE_ISSUE", entityId: issue.id, summary: `Vehicle issue moved from ${issue.status} to ${input.status}`, metadata: { previousStatus: issue.status, nextStatus: input.status } });
      return updated;
    })
  }),
  triage: router({
    update: fleetOpsProcedure.input(z2.object({ kind: z2.enum(["VEHICLE_ISSUE", "WORK_ORDER", "DOCUMENT", "LOW_STOCK"]), referenceId: z2.string().uuid(), state: z2.enum(["ACKNOWLEDGED", "ASSIGNED", "DEFERRED", "RESOLVED"]), note: z2.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const triageEntity = input.kind === "VEHICLE_ISSUE" ? await fleetDb.vehicleIssue.findFirst({ where: { id: input.referenceId, orgId: ctx.fleetopsUser.orgId } }) : input.kind === "WORK_ORDER" ? await fleetDb.workOrder.findFirst({ where: { id: input.referenceId, orgId: ctx.fleetopsUser.orgId } }) : input.kind === "DOCUMENT" ? await fleetDb.document.findFirst({ where: { id: input.referenceId, orgId: ctx.fleetopsUser.orgId } }) : await fleetDb.inventoryPart.findFirst({ where: { id: input.referenceId, orgId: ctx.fleetopsUser.orgId } });
      if (!triageEntity) throw new TRPCError3({ code: "NOT_FOUND", message: "Triage item was not found in this organization." });
      await recordAudit(ctx, { action: "TRIAGE_STATE_CHANGED", entityType: input.kind, entityId: input.referenceId, summary: `${input.kind} triage marked ${input.state.toLowerCase()}`, metadata: { state: input.state, assigneeId: input.state === "ASSIGNED" ? ctx.fleetopsUser.id : null, note: input.note ?? null } });
      return { kind: input.kind, referenceId: input.referenceId, state: input.state, assigneeId: input.state === "ASSIGNED" ? ctx.fleetopsUser.id : null };
    }),
    createWorkOrderFromIssue: fleetOpsProcedure.input(z2.object({ issueId: z2.string().uuid(), assignedMechanicId: z2.string().uuid().optional(), priority: z2.nativeEnum(Priority).optional(), note: z2.string().trim().max(1e3).optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const issue = await fleetDb.vehicleIssue.findFirst({ where: { id: input.issueId, orgId: ctx.fleetopsUser.orgId }, include: { vehicle: true } });
      if (!issue) throw new TRPCError3({ code: "NOT_FOUND", message: "Vehicle issue not found in this organization." });
      if (["RESOLVED", "CLOSED"].includes(issue.status)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Resolved issues cannot be dispatched." });
      if (input.assignedMechanicId) {
        const assignee = await fleetDb.user.findFirst({ where: { id: input.assignedMechanicId, orgId: ctx.fleetopsUser.orgId, role: { in: ["MECHANIC", "TECHNICIAN"] } } });
        if (!assignee) throw new TRPCError3({ code: "BAD_REQUEST", message: "Assignee must belong to this organization and be a mechanic or technician." });
      }
      const existingLinks = await fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, action: "WORK_ORDER_CREATED", entityType: "WORK_ORDER" } });
      const alreadyDispatched = existingLinks.some((event) => {
        try {
          return JSON.parse(event.metadata ?? "{}").sourceIssueId === issue.id;
        } catch {
          return false;
        }
      });
      if (alreadyDispatched) throw new TRPCError3({ code: "CONFLICT", message: "This driver issue already has a dispatched work order." });
      const workOrder = await fleetDb.workOrder.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, vehicleId: issue.vehicleId, title: `Driver issue: ${issue.title}`, description: [issue.description, input.note].filter(Boolean).join("\n\n"), priority: input.priority ?? issue.priority, status: "OPEN", assignedMechanicId: input.assignedMechanicId, createdAt: /* @__PURE__ */ new Date() } });
      await fleetDb.vehicleIssue.update({ where: { id: issue.id }, data: { status: "ACKNOWLEDGED", updatedAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "WORK_ORDER_CREATED", entityType: "WORK_ORDER", entityId: workOrder.id, summary: `Work order dispatched from driver issue: ${issue.title}`, metadata: { sourceIssueId: issue.id, sourceType: "VEHICLE_ISSUE", assignedMechanicId: input.assignedMechanicId ?? null } });
      await recordAudit(ctx, { action: "VEHICLE_ISSUE_DISPATCHED", entityType: "VEHICLE_ISSUE", entityId: issue.id, summary: `Driver issue dispatched to maintenance: ${issue.title}`, metadata: { workOrderId: workOrder.id, assignedMechanicId: input.assignedMechanicId ?? null } });
      return workOrder;
    }),
    queue: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const cutoff = new Date(Date.now() + 30 * 864e5);
      const [issues, orders, documents2, parts, triageAudits] = await Promise.all([fleetDb.vehicleIssue.findMany({ where: { orgId: ctx.fleetopsUser.orgId, status: { notIn: ["RESOLVED", "CLOSED"] } }, include: { vehicle: true }, orderBy: { createdAt: "desc" }, take: 50 }), fleetDb.workOrder.findMany({ where: { orgId: ctx.fleetopsUser.orgId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, include: { vehicle: true, assignedMechanic: true }, orderBy: { createdAt: "desc" }, take: 50 }), fleetDb.document.findMany({ where: { orgId: ctx.fleetopsUser.orgId, expiryDate: { lte: cutoff } }, include: { vehicle: true }, orderBy: { expiryDate: "asc" }, take: 50 }), fleetDb.inventoryPart.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { name: "asc" }, take: 200 }), fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, action: "TRIAGE_STATE_CHANGED" }, orderBy: { createdAt: "desc" }, take: 500 })]);
      const triageState = /* @__PURE__ */ new Map();
      for (const event of triageAudits) {
        const key = `${event.entityType}:${event.entityId}`;
        if (!triageState.has(key)) {
          try {
            const metadata = JSON.parse(event.metadata ?? "{}");
            triageState.set(key, metadata.state ? `${metadata.state}${metadata.assigneeId ? `:${metadata.assigneeId}` : ""}` : "");
          } catch {
            triageState.set(key, "");
          }
        }
      }
      const withState = (item, kind) => ({ ...item, triageState: triageState.get(`${kind}:${item.referenceId}`) ?? null });
      const issueItems = issues.map((item) => withState({ id: item.id, kind: "VEHICLE_ISSUE", title: item.title, subtitle: `${item.vehicle ? vehicleIdentity(item.vehicle) : item.vehicleId} \xB7 Driver issue`, priority: item.priority, status: item.status, createdAt: item.createdAt, referenceId: item.id, actionable: true }, "VEHICLE_ISSUE"));
      const orderItems = orders.map((item) => withState({ id: item.id, kind: "WORK_ORDER", title: item.title, subtitle: `${item.vehicle ? vehicleIdentity(item.vehicle) : item.vehicleId} \xB7 ${item.assignedMechanic?.fullName ?? "Unassigned"}`, priority: item.priority, status: item.status, createdAt: item.createdAt, referenceId: item.id, actionable: true }, "WORK_ORDER"));
      const documentItems = documents2.map((item) => withState({ id: item.id, kind: "DOCUMENT", title: item.title, subtitle: `${item.vehicle ? vehicleIdentity(item.vehicle) : "Organization document"} \xB7 expires ${new Date(item.expiryDate).toLocaleDateString("en-IN")}`, priority: new Date(item.expiryDate) < /* @__PURE__ */ new Date() ? "CRITICAL" : "HIGH", status: "REVIEW", createdAt: item.createdAt, referenceId: item.id, actionable: true }, "DOCUMENT"));
      const lowStockItems = parts.filter((item) => Number(item.quantityOnHand) <= Number(item.minReorderLevel)).map((item) => withState({ id: item.id, kind: "LOW_STOCK", title: `${item.sku} \xB7 ${item.name}`, subtitle: `${item.quantityOnHand} on hand \xB7 reorder at ${item.minReorderLevel}`, priority: "HIGH", status: "REORDER", createdAt: item.updatedAt ?? item.createdAt, referenceId: item.id, actionable: true }, "LOW_STOCK"));
      return [...issueItems, ...orderItems, ...documentItems, ...lowStockItems].filter((item) => !["DEFERRED", "RESOLVED"].includes(String(item.triageState).split(":")[0])).sort((a, b) => {
        const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (rank[a.priority] ?? 4) - (rank[b.priority] ?? 4) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }).slice(0, 100);
    })
  }),
  audit: router({
    list: fleetOpsProcedure.input(z2.object({ actorId: z2.string().uuid().optional(), actorRole: z2.string().optional(), entityType: z2.string().optional(), action: z2.string().optional(), outcome: z2.enum(["SUCCESS", "ERROR"]).optional(), dateFrom: z2.string().datetime().optional(), dateTo: z2.string().datetime().optional(), limit: z2.number().int().min(1).max(200).default(100) }).optional()).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const rows = await fleetDb.auditEvent.findMany({ where: { orgId: ctx.fleetopsUser.orgId, ...input?.actorId ? { actorId: input.actorId } : {}, ...input?.actorRole ? { actorRole: input.actorRole } : {}, ...input?.entityType ? { entityType: input.entityType } : {}, ...input?.action ? { action: input.action } : {}, ...input?.dateFrom || input?.dateTo ? { createdAt: { ...input?.dateFrom ? { gte: new Date(input.dateFrom) } : {}, ...input?.dateTo ? { lte: new Date(input.dateTo) } : {} } } : {} }, orderBy: { createdAt: "desc" }, take: input?.limit ?? 100 });
      if (!input?.outcome) return rows;
      return rows.filter((row) => {
        let metadata = {};
        try {
          metadata = row.metadata ? JSON.parse(row.metadata) : {};
        } catch {
          metadata = {};
        }
        const outcome = String(metadata.outcome ?? "SUCCESS").toUpperCase();
        return outcome === input.outcome;
      });
    })
  }),
  automation: router({
    evaluate: fleetOpsProcedure.mutation(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      return evaluateAllOrganizations();
    })
  }),
  team: router({
    members: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      return fleetDb.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, select: { id: true, email: true, fullName: true, role: true, createdAt: true }, orderBy: { fullName: "asc" } });
    }),
    assignableMembers: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      return fleetDb.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId, role: { in: ["MECHANIC", "TECHNICIAN"] } }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } });
    }),
    invitations: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      return fleetDb.invitation.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { createdAt: "desc" } });
    }),
    invite: fleetOpsProcedure.input(z2.object({ email: z2.string().email(), role: z2.enum(["FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "DRIVER", "INVENTORY_MANAGER", "ACCOUNTANT"]) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      assertWritable(ctx.fleetopsUser.org);
      await assertUserCapacity(ctx.fleetopsUser.orgId, ctx.fleetopsUser.org.maxUsers);
      const normalizedEmail = input.email.toLowerCase();
      const existing = await fleetDb.invitation.findFirst({ where: { orgId: ctx.fleetopsUser.orgId, email: normalizedEmail, acceptedAt: null, revokedAt: null } });
      if (existing && new Date(existing.expiresAt).getTime() > Date.now()) throw new TRPCError3({ code: "CONFLICT", message: "An active invitation already exists for this email." });
      const invitation = await withServerTimeout(fleetDb.invitation.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, email: normalizedEmail, role: input.role, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3), lastSentAt: /* @__PURE__ */ new Date(), createdAt: /* @__PURE__ */ new Date() } }), "Invitation storage did not respond within 12 seconds. No invitation was confirmed.");
      await recordAudit(ctx, { action: "INVITATION_CREATED", entityType: "INVITATION", entityId: invitation.id, summary: `Invitation created for ${input.email.toLowerCase()}`, metadata: { role: input.role } });
      const origin = String(ctx.req?.headers?.origin ?? process.env.PUBLIC_APP_URL ?? "https://fleetops-v2.vercel.app");
      const joinUrl = new URL(`/join/${invitation.tokenHash}`, origin).toString();
      const authInvite = await createAuthInvitation(normalizedEmail, joinUrl);
      const emailResult = authInvite.error ? { error: { message: authInvite.error.message } } : await sendInvitationEmail({ organizationName: ctx.fleetopsUser.org.name, inviteeEmail: normalizedEmail, role: input.role, joinUrl, expiresAt: invitation.expiresAt ? new Date(invitation.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3) });
      return { ...invitation, joinUrl, delivery: emailResult.error ? "MANUAL_TOKEN" : "EMAIL", deliveryError: emailResult.error?.message, serverRelease: FLEETOPS_SERVER_RELEASE };
    }),
    resendInvitation: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      assertWritable(ctx.fleetopsUser.org);
      const invitation = await fleetDb.invitation.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!invitation) throw new TRPCError3({ code: "NOT_FOUND", message: "Invitation not found in this organization." });
      if (invitation.acceptedAt || invitation.revokedAt) throw new TRPCError3({ code: "BAD_REQUEST", message: "Accepted or revoked invitations cannot be resent." });
      const token = crypto.randomUUID();
      const updated = await fleetDb.invitation.update({ where: { id: invitation.id }, data: { tokenHash: token, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3), resendCount: Number(invitation.resendCount ?? 0) + 1, lastSentAt: /* @__PURE__ */ new Date() } });
      const origin = String(ctx.req?.headers?.origin ?? process.env.PUBLIC_APP_URL ?? "https://fleetops-v2.vercel.app");
      const joinUrl = new URL(`/join/${token}`, origin).toString();
      const authInvite = await createAuthInvitation(invitation.email, joinUrl);
      const emailResult = authInvite.error ? { error: { message: authInvite.error.message } } : await sendInvitationEmail({ organizationName: ctx.fleetopsUser.org.name, inviteeEmail: invitation.email, role: invitation.role, joinUrl, expiresAt: updated.expiresAt ? new Date(updated.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3) });
      await recordAudit(ctx, { action: "INVITATION_RESENT", entityType: "INVITATION", entityId: invitation.id, summary: `Invitation resent to ${invitation.email}`, metadata: { resendCount: updated.resendCount, delivery: emailResult.error ? "MANUAL_TOKEN" : "EMAIL" } });
      return { ...updated, joinUrl, delivery: emailResult.error ? "MANUAL_TOKEN" : "EMAIL", deliveryError: emailResult.error?.message, serverRelease: FLEETOPS_SERVER_RELEASE };
    }),
    revokeInvitation: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), reason: z2.string().trim().min(3).max(500) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      assertWritable(ctx.fleetopsUser.org);
      const invitation = await fleetDb.invitation.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!invitation) throw new TRPCError3({ code: "NOT_FOUND", message: "Invitation not found in this organization." });
      if (invitation.acceptedAt) throw new TRPCError3({ code: "BAD_REQUEST", message: "Accepted invitations cannot be revoked." });
      if (invitation.revokedAt) return invitation;
      const revoked = await fleetDb.invitation.update({ where: { id: invitation.id }, data: { revokedAt: /* @__PURE__ */ new Date(), revokedById: ctx.fleetopsUser.id } });
      await recordAudit(ctx, { action: "INVITATION_REVOKED", entityType: "INVITATION", entityId: invitation.id, summary: `Invitation revoked for ${invitation.email}`, metadata: { reason: input.reason } });
      return revoked;
    }),
    updateRole: fleetOpsProcedure.input(z2.object({ userId: z2.string().uuid(), role: z2.enum(["FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "DRIVER", "INVENTORY_MANAGER", "ACCOUNTANT"]) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      assertWritable(ctx.fleetopsUser.org);
      const member = await fleetDb.user.findFirst({ where: { id: input.userId, orgId: ctx.fleetopsUser.orgId } });
      if (!member) throw new TRPCError3({ code: "NOT_FOUND", message: "Team member not found." });
      const updated = await fleetDb.user.update({ where: { id: input.userId }, data: { role: input.role } });
      await recordAudit(ctx, { action: "ROLE_CHANGED", entityType: "USER", entityId: member.id, summary: `Role changed for ${member.fullName}`, metadata: { previousRole: member.role, nextRole: input.role } });
      return updated;
    }),
    removeMember: fleetOpsProcedure.input(z2.object({ userId: z2.string().uuid() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      assertWritable(ctx.fleetopsUser.org);
      if (input.userId === ctx.fleetopsUser.id) throw new TRPCError3({ code: "FORBIDDEN", message: "You cannot remove your own organization owner account." });
      const member = await fleetDb.user.findFirst({ where: { id: input.userId, orgId: ctx.fleetopsUser.orgId } });
      if (!member) throw new TRPCError3({ code: "NOT_FOUND", message: "Team member not found in this organization." });
      if (member.role === "SUPERADMIN") throw new TRPCError3({ code: "FORBIDDEN", message: "Organization owner accounts cannot be removed from Team." });
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(member.authUserId);
      if (authError && !/not found|already deleted/i.test(authError.message)) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: `Auth account could not be removed: ${authError.message}` });
      const deleted = await fleetDb.user.delete({ where: { id: member.id } });
      await recordAudit(ctx, { action: "TEAM_MEMBER_REMOVED", entityType: "USER", entityId: member.id, summary: `Removed ${member.fullName} from the organization`, metadata: { email: member.email, role: member.role, authUserId: member.authUserId } });
      return { id: deleted.id, email: deleted.email, role: deleted.role };
    }),
    operationalRoster: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER"]);
      const [members, assignments, vehicles2] = await Promise.all([fleetDb.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId, role: { in: ["DRIVER", "MECHANIC", "TECHNICIAN"] } }, select: { id: true, fullName: true, email: true, role: true }, orderBy: { fullName: "asc" } }), fleetDb.vehicleAssignment.findMany({ where: { orgId: ctx.fleetopsUser.orgId, active: true }, orderBy: { updatedAt: "desc" } }), fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, select: { id: true, licensePlate: true, make: true, model: true } })]);
      const memberById = new Map(members.map((member) => [member.id, member]));
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      const enrichedAssignments = assignments.map((assignment) => ({ ...assignment, driver: memberById.get(assignment.driverId), vehicle: vehicleById.get(assignment.vehicleId) }));
      return { members, assignments: enrichedAssignments, activeAssignmentCount: enrichedAssignments.length, unassignedDrivers: members.filter((member) => member.role === "DRIVER" && !enrichedAssignments.some((assignment) => assignment.driverId === member.id)).length, unassignedVehicles: vehicles2.filter((vehicle) => !enrichedAssignments.some((assignment) => assignment.vehicleId === vehicle.id)).length };
    }),
    driverHandoffs: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const [assignments, drivers, vehicles2, issues, safetyNotifications] = await Promise.all([fleetDb.vehicleAssignment.findMany({ where: { orgId: ctx.fleetopsUser.orgId, active: true }, orderBy: { updatedAt: "desc" } }), fleetDb.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId, role: "DRIVER" }, select: { id: true, fullName: true, email: true } }), fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, select: { id: true, licensePlate: true, make: true, model: true, status: true } }), fleetDb.vehicleIssue.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { createdAt: "desc" }, take: 500 }), fleetDb.notification.findMany({ where: { orgId: ctx.fleetopsUser.orgId, type: "DRIVER_SAFETY_DISPOSITION" }, orderBy: { createdAt: "desc" }, take: 500 })]);
      const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      const latestIssueByVehicle = /* @__PURE__ */ new Map();
      for (const issue of issues) if (!latestIssueByVehicle.has(issue.vehicleId)) latestIssueByVehicle.set(issue.vehicleId, issue);
      const latestDispositionByVehicle = /* @__PURE__ */ new Map();
      for (const notification of safetyNotifications) if (!latestDispositionByVehicle.has(notification.referenceId)) latestDispositionByVehicle.set(notification.referenceId, notification);
      return assignments.map((assignment) => {
        const vehicle = vehicleById.get(assignment.vehicleId);
        const driver = driverById.get(assignment.driverId);
        const issue = latestIssueByVehicle.get(assignment.vehicleId);
        const disposition = latestDispositionByVehicle.get(assignment.vehicleId);
        const safety = vehicle?.status === "OUT_OF_SERVICE" ? "UNSAFE" : vehicle?.status === "ACTIVE" ? "ACTIVE" : "REVIEW";
        return { assignmentId: assignment.id, driverId: assignment.driverId, driverName: driver?.fullName ?? "Unknown driver", driverEmail: driver?.email ?? "", vehicleId: assignment.vehicleId, vehicleLabel: vehicle?.licensePlate ?? assignment.vehicleId, vehicleStatus: vehicle?.status ?? "UNKNOWN", safety, latestIssue: issue ? { id: issue.id, title: issue.title, priority: issue.priority, status: issue.status, createdAt: issue.createdAt } : null, latestDisposition: disposition ? { severity: disposition.severity, message: disposition.message, createdAt: disposition.createdAt } : null, acknowledgedAt: issue?.status === "ACKNOWLEDGED" ? issue.updatedAt : null };
      });
    }),
    assignVehicle: fleetOpsProcedure.input(z2.object({ driverId: z2.string().uuid(), vehicleId: z2.string().uuid(), active: z2.boolean().default(true) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const driver = await fleetDb.user.findFirst({ where: { id: input.driverId, orgId: ctx.fleetopsUser.orgId, role: "DRIVER" } });
      const vehicle = await fleetDb.vehicle.findFirst({ where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId } });
      if (!driver || !vehicle) throw new TRPCError3({ code: "NOT_FOUND", message: "Driver or vehicle not found in this organization." });
      const conflicting = await fleetDb.vehicleAssignment.findMany({ where: { orgId: ctx.fleetopsUser.orgId, active: true } });
      const closed = conflicting.filter((item) => item.driverId === input.driverId || item.vehicleId === input.vehicleId);
      await Promise.all(closed.map((item) => fleetDb.vehicleAssignment.update({ where: { id: item.id }, data: { active: false } })));
      const assignment = await fleetDb.vehicleAssignment.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, vehicleId: input.vehicleId, driverId: input.driverId, active: input.active, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: closed.length ? "VEHICLE_REASSIGNED" : "VEHICLE_ASSIGNED", entityType: "VEHICLE_ASSIGNMENT", entityId: assignment.id, summary: `${closed.length ? "Reassigned" : "Assigned"} ${vehicleIdentity(vehicle)} to ${driver.fullName}`, metadata: { vehicleId: input.vehicleId, driverId: input.driverId, active: input.active, closedAssignmentIds: closed.map((item) => item.id) } });
      return { ...assignment, closedAssignments: closed.length };
    })
  }),
  vendors: router({
    list: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      return fleetDb.vendor.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { name: "asc" } });
    }),
    create: fleetOpsProcedure.input(z2.object({ name: z2.string().trim().min(2).max(160), contactPerson: z2.string().trim().max(120).optional(), phone: z2.string().trim().min(5).max(40), email: z2.string().trim().email().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const created = await fleetDb.vendor.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, name: input.name, contactPerson: input.contactPerson || void 0, phone: input.phone, email: input.email || void 0, createdAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "VENDOR_CREATED", entityType: "VENDOR", entityId: created.id, summary: `Vendor created: ${created.name}`, metadata: { phone: created.phone } });
      return created;
    }),
    pricingHistory: fleetOpsProcedure.input(z2.object({ vendorId: z2.string().uuid(), partId: z2.string().uuid().optional() })).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      const vendor = await fleetDb.vendor.findFirst({ where: { id: input.vendorId, orgId: ctx.fleetopsUser.orgId } });
      if (!vendor) throw new TRPCError3({ code: "NOT_FOUND", message: "Vendor not found in your organization." });
      const [orders, receipts, parts] = await Promise.all([fleetDb.purchaseOrder.findMany({ where: { orgId: ctx.fleetopsUser.orgId, vendorId: vendor.id }, orderBy: { createdAt: "desc" } }), fleetDb.purchaseOrderReceipt.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { receivedAt: "desc" } }), fleetDb.inventoryPart.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const orderIds = new Set(orders.map((order) => order.id));
      const partById = new Map(parts.map((part) => [part.id, part]));
      const rows = receipts.filter((receipt) => orderIds.has(receipt.purchaseOrderId) && (!input.partId || receipt.partId === input.partId)).map((receipt) => ({ ...receipt, vendorId: vendor.id, vendorName: vendor.name, part: partById.get(receipt.partId) ?? null }));
      const suppliedParts = Array.from(new Map(rows.filter((row) => row.part).map((row) => [row.partId, row.part])).values());
      return { vendor, rows, suppliedParts, purchaseHistory: orders.map((order) => ({ id: order.id, status: order.status, totalCost: order.totalCost, createdAt: order.createdAt })), averageUnitCost: rows.length ? rows.reduce((total, row) => total + Number(row.unitCost), 0) / rows.length : null };
    })
  }),
  purchaseOrders: router({
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      const [orders, vendors2] = await Promise.all([fleetDb.purchaseOrder.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { createdAt: "desc" } }), fleetDb.vendor.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const vendorById = new Map(vendors2.map((vendor) => [vendor.id, vendor]));
      return orders.map((order) => ({ ...order, vendor: vendorById.get(order.vendorId) ?? null }));
    }),
    create: fleetOpsProcedure.input(z2.object({ vendorId: z2.string().uuid(), totalCost: z2.number().nonnegative() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const vendor = await fleetDb.vendor.findFirst({ where: { id: input.vendorId, orgId: ctx.fleetopsUser.orgId } });
      if (!vendor) throw new TRPCError3({ code: "NOT_FOUND", message: "Vendor not found in your organization." });
      const created = await fleetDb.purchaseOrder.create({ data: { id: crypto.randomUUID(), ...input, status: "DRAFT", totalCost: input.totalCost, orgId: ctx.fleetopsUser.orgId, createdAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "PURCHASE_ORDER_CREATED", entityType: "PURCHASE_ORDER", entityId: created.id, summary: `Purchase order created: \u20B9${Number(created.totalCost).toLocaleString("en-IN")}`, metadata: { vendorId: created.vendorId } });
      return created;
    }),
    updateStatus: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), status: z2.enum(["DRAFT", "SENT", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED", "CLOSED"]), expectedUpdatedAt: z2.coerce.date().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      if (input.status === "APPROVED" && ctx.fleetopsUser.role !== "SUPERADMIN") throw new TRPCError3({ code: "FORBIDDEN", message: "Only a Superadmin can approve a purchase order." });
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.purchaseOrder.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Purchase order not found in your organization." });
      if (input.expectedUpdatedAt && new Date(order.updatedAt).getTime() !== input.expectedUpdatedAt.getTime()) throw new TRPCError3({ code: "CONFLICT", message: "This purchase order changed elsewhere. Refresh before updating its status." });
      const allowed = { DRAFT: ["SENT", "APPROVED", "CANCELLED"], SENT: ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"], APPROVED: ["ORDERED", "CANCELLED"], ORDERED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"], PARTIALLY_RECEIVED: ["RECEIVED", "CANCELLED"], RECEIVED: ["CLOSED"], CLOSED: [], CANCELLED: [] };
      if (!allowed[order.status]?.includes(input.status)) throw new TRPCError3({ code: "BAD_REQUEST", message: `Cannot move purchase order from ${order.status} to ${input.status}.` });
      const updated = await fleetDb.purchaseOrder.update({ where: { id: order.id }, data: { status: input.status, ...input.status === "RECEIVED" ? { receivedAt: /* @__PURE__ */ new Date() } : {}, ...input.status === "CLOSED" ? { closedAt: /* @__PURE__ */ new Date() } : {} } });
      await recordAudit(ctx, { action: "PURCHASE_ORDER_STATUS_CHANGED", entityType: "PURCHASE_ORDER", entityId: order.id, summary: `Purchase order moved from ${order.status} to ${input.status}`, metadata: { previousStatus: order.status, nextStatus: input.status } });
      return updated;
    }),
    receivePartial: fleetOpsProcedure.input(z2.object({ purchaseOrderId: z2.string().uuid(), partId: z2.string().uuid(), quantity: z2.number().int().positive(), damagedQuantity: z2.number().int().nonnegative().default(0), backorderedQuantity: z2.number().int().nonnegative().default(0), varianceReason: z2.string().trim().min(3).max(300).optional(), expectedQuantityOnHand: z2.number().int().nonnegative(), unitCost: z2.number().nonnegative(), invoiceNumber: z2.string().trim().max(120).optional(), location: z2.string().trim().max(120).optional(), complete: z2.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      if ((input.damagedQuantity > 0 || input.backorderedQuantity > 0) && !input.varianceReason) throw new TRPCError3({ code: "BAD_REQUEST", message: "A variance reason is required for damaged or back-ordered quantities." });
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const order = await fleetDb.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, orgId: ctx.fleetopsUser.orgId } });
      if (!order || ["CANCELLED", "CLOSED"].includes(order.status)) throw new TRPCError3({ code: "NOT_FOUND", message: "Purchase order is not receivable in this organization." });
      const vendor = await fleetDb.vendor.findFirst({ where: { id: order.vendorId, orgId: ctx.fleetopsUser.orgId } });
      if (!vendor) throw new TRPCError3({ code: "NOT_FOUND", message: "Purchase order vendor is not in this organization." });
      const part = await fleetDb.inventoryPart.findFirst({ where: { id: input.partId, orgId: ctx.fleetopsUser.orgId } });
      if (!part) throw new TRPCError3({ code: "NOT_FOUND", message: "Inventory part not found in this organization." });
      const received = await fleetDb.$transaction(async (tx) => {
        const changed = await tx.inventoryPart.updateMany({ where: { id: part.id, orgId: ctx.fleetopsUser.orgId, quantityOnHand: input.expectedQuantityOnHand }, data: { quantityOnHand: input.expectedQuantityOnHand + input.quantity, unitCost: input.unitCost, ...input.location ? { binLocation: input.location } : {} } });
        if (!changed.count) throw new TRPCError3({ code: "CONFLICT", message: "Inventory changed since it was loaded. Refresh the balance and retry." });
        const receipt = await tx.purchaseOrderReceipt.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, purchaseOrderId: order.id, partId: part.id, quantity: input.quantity, damagedQuantity: input.damagedQuantity, backorderedQuantity: input.backorderedQuantity, varianceReason: input.varianceReason, unitCost: input.unitCost, invoiceNumber: input.invoiceNumber, location: input.location, receivedById: ctx.fleetopsUser.id, receivedAt: /* @__PURE__ */ new Date() } });
        if (tx.inventoryMovement?.create) await tx.inventoryMovement.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, partId: part.id, actorId: ctx.fleetopsUser.id, movementType: "RECEIPT", quantity: input.quantity, unitCost: input.unitCost, reason: `Purchase order receipt ${order.id}`, createdAt: /* @__PURE__ */ new Date() } });
        const updatedOrder = await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: input.complete ? "RECEIVED" : "PARTIALLY_RECEIVED", ...input.invoiceNumber ? { supplierInvoiceNumber: input.invoiceNumber } : {}, ...input.complete ? { receivedAt: /* @__PURE__ */ new Date() } : {} } });
        return { receipt, order: updatedOrder };
      });
      await recordAudit(ctx, { action: "PURCHASE_ORDER_PARTIALLY_RECEIVED", entityType: "PURCHASE_ORDER", entityId: order.id, summary: `Received ${input.quantity} units into ${part.name}`, metadata: { partId: part.id, quantity: input.quantity, damagedQuantity: input.damagedQuantity, backorderedQuantity: input.backorderedQuantity, varianceReason: input.varianceReason, unitCost: input.unitCost, invoiceNumber: input.invoiceNumber, location: input.location, complete: input.complete } });
      return received;
    }),
    receipts: fleetOpsProcedure.input(z2.object({ purchaseOrderId: z2.string().uuid() })).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      const order = await fleetDb.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, orgId: ctx.fleetopsUser.orgId } });
      if (!order) throw new TRPCError3({ code: "NOT_FOUND", message: "Purchase order not found in your organization." });
      return fleetDb.purchaseOrderReceipt.findMany({ where: { purchaseOrderId: order.id, orgId: ctx.fleetopsUser.orgId }, orderBy: { receivedAt: "desc" } });
    })
  }),
  compliance: router({
    summary: fleetOpsProcedure.input(z2.object({ expiryWindowDays: z2.number().int().min(1).max(365).default(30) }).optional()).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const windowDays = input?.expiryWindowDays ?? 30;
      const [vehicles2, assignments, documents2, users2] = await Promise.all([fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { licensePlate: "asc" } }), fleetDb.vehicleAssignment.findMany({ where: { orgId: ctx.fleetopsUser.orgId, active: true } }), fleetDb.document.findMany({ where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null } }), fleetDb.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const now = Date.now();
      const windowEnd = now + windowDays * 864e5;
      const documentsByVehicle = /* @__PURE__ */ new Map();
      for (const document of documents2) {
        if (document.vehicleId) documentsByVehicle.set(document.vehicleId, [...documentsByVehicle.get(document.vehicleId) ?? [], document]);
      }
      const classify = (rows) => {
        if (!rows.length) return "MISSING";
        if (rows.some((row) => new Date(row.expiryDate).getTime() < now)) return "EXPIRED";
        if (rows.some((row) => new Date(row.expiryDate).getTime() <= windowEnd)) return "EXPIRING";
        return "VALID";
      };
      const vehicleRows = vehicles2.map((vehicle) => ({ vehicleId: vehicle.id, licensePlate: vehicle.licensePlate, status: classify(documentsByVehicle.get(vehicle.id) ?? []), documentCount: (documentsByVehicle.get(vehicle.id) ?? []).length }));
      const userById = new Map(users2.map((user) => [user.id, user]));
      const driverRows = assignments.filter((assignment) => assignment.driverId).map((assignment) => {
        const vehicle = vehicles2.find((row) => row.id === assignment.vehicleId);
        const status = classify(vehicle ? documentsByVehicle.get(vehicle.id) ?? [] : []);
        const driver = userById.get(assignment.driverId);
        return { driverId: assignment.driverId, driverName: driver?.fullName ?? driver?.email ?? "Assigned driver", vehicleId: assignment.vehicleId, licensePlate: vehicle?.licensePlate ?? "Unassigned vehicle", status };
      });
      const driverCounts = { VALID: driverRows.filter((row) => row.status === "VALID").length, EXPIRING: driverRows.filter((row) => row.status === "EXPIRING").length, EXPIRED: driverRows.filter((row) => row.status === "EXPIRED").length, MISSING: driverRows.filter((row) => row.status === "MISSING").length };
      const counts = { VALID: vehicleRows.filter((row) => row.status === "VALID").length, EXPIRING: vehicleRows.filter((row) => row.status === "EXPIRING").length, EXPIRED: vehicleRows.filter((row) => row.status === "EXPIRED").length, MISSING: vehicleRows.filter((row) => row.status === "MISSING").length };
      return { expiryWindowDays: windowDays, counts, vehicles: vehicleRows, drivers: driverRows, driverCounts };
    })
  }),
  documents: router({
    exportPdf: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const [documentRows, vehicles2] = await Promise.all([fleetDb.document.findMany({ where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null }, orderBy: { expiryDate: "asc" } }), fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      const rows = documentRows.map((row) => ({ ...row, vehicle: row.vehicleId ? vehicleById.get(row.vehicleId) ?? null : null }));
      const content = simplePdf("VahanSync Compliance Register", [`Organization: ${ctx.fleetopsUser.org.name}`, `Generated: ${(/* @__PURE__ */ new Date()).toLocaleDateString("en-IN")}`, `Documents: ${rows.length}`, ...rows.map((row) => `${row.title} | ${row.docType} | ${row.vehicle ? vehicleIdentity(row.vehicle) : "Organization"} | expires ${new Date(row.expiryDate).toLocaleDateString("en-IN")}`)]);
      await recordAudit(ctx, { action: "DOCUMENT_EXPORT_PDF", entityType: "DOCUMENT", summary: `Exported compliance PDF with ${rows.length} documents`, metadata: { count: rows.length } });
      return { filename: `vahansync-compliance-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf`, content, rowCount: rows.length };
    }),
    exportCsv: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const [documentRows, vehicles2] = await Promise.all([fleetDb.document.findMany({ where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null }, orderBy: { expiryDate: "asc" } }), fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      const rows = documentRows.map((row) => ({ ...row, vehicle: row.vehicleId ? vehicleById.get(row.vehicleId) ?? null : null }));
      const csv = csvDocument(rows.map((row) => ({ title: row.title, docType: row.docType, vehicle: row.vehicle ? vehicleIdentity(row.vehicle) : "Organization", expiryDate: new Date(row.expiryDate).toISOString().slice(0, 10), fileStatus: row.fileKey ? "STORED" : "MISSING" })), ["title", "docType", "vehicle", "expiryDate", "fileStatus"]);
      await recordAudit(ctx, { action: "DOCUMENT_EXPORT_CSV", entityType: "DOCUMENT", summary: `Exported ${rows.length} compliance documents`, metadata: { count: rows.length } });
      return { filename: `vahansync-compliance-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`, content: csv, rowCount: rows.length };
    }),
    previewImport: fleetOpsProcedure.input(z2.object({ csv: z2.string().max(1e6) })).query(({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const parsed = parseComplianceCsv(input.csv);
      return { rowCount: parsed.rows.length, validCount: parsed.rows.filter((row) => !row.errors.length).length, errors: parsed.errors, rows: parsed.rows.slice(0, 100).map((item) => ({ rowNumber: item.rowNumber, ...item.row, errors: item.errors })) };
    }),
    importCsv: fleetOpsProcedure.input(z2.object({ csv: z2.string().max(1e6) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const parsed = parseComplianceCsv(input.csv);
      if (parsed.errors.length) throw new TRPCError3({ code: "BAD_REQUEST", message: parsed.errors.slice(0, 8).join("; ") });
      const vehicles2 = await fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } });
      const vehicleIds = new Set(vehicles2.map((vehicle) => vehicle.id));
      const existing = await fleetDb.document.findMany({ where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null } });
      const seen = new Set(existing.map((document) => `${document.title}|${document.docType}|${document.vehicleId}|${new Date(document.expiryDate).toISOString().slice(0, 10)}`));
      const candidates = parsed.rows.filter((item) => vehicleIds.has(item.row.vehicleId)).filter((item) => {
        const key = `${item.row.title}|${item.row.docType}|${item.row.vehicleId}|${item.row.expiryDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (candidates.length !== parsed.rows.length) throw new TRPCError3({ code: "BAD_REQUEST", message: "Every row must reference an organization vehicle and must not duplicate an existing compliance document." });
      const created = await Promise.all(candidates.map((item) => fleetDb.document.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, title: item.row.title, docType: item.row.docType, expiryDate: new Date(item.row.expiryDate), vehicleId: item.row.vehicleId, fileUrl: item.row.fileUrl || void 0, createdAt: /* @__PURE__ */ new Date() } })));
      await recordAudit(ctx, { action: "DOCUMENT_IMPORT_CSV", entityType: "DOCUMENT", summary: `Imported ${created.length} compliance documents`, metadata: { count: created.length } });
      return { importedCount: created.length };
    }),
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const [documents2, vehicles2] = await Promise.all([fleetDb.document.findMany({ where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null }, orderBy: { expiryDate: "asc" } }), fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      return documents2.map((document) => ({ ...document, vehicle: document.vehicleId ? vehicleById.get(document.vehicleId) ?? null : null }));
    }),
    versions: fleetOpsProcedure.input(z2.object({ documentId: z2.string().uuid() })).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const document = await fleetDb.document.findFirst({ where: { id: input.documentId, orgId: ctx.fleetopsUser.orgId } });
      if (!document) throw new TRPCError3({ code: "NOT_FOUND", message: "Document not found in this organization." });
      return fleetDb.documentVersion.findMany({ where: { orgId: ctx.fleetopsUser.orgId, documentId: document.id }, orderBy: { versionNumber: "desc" }, take: 50 });
    }),
    create: fleetOpsProcedure.input(z2.object({ title: z2.string().min(2), docType: z2.string().min(2), fileUrl: z2.string().url().optional(), fileKey: z2.string().optional(), fileData: z2.string().max(4e6).optional(), fileContentType: z2.string().optional(), expiryDate: z2.coerce.date(), vehicleId: z2.string().uuid().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const { fileData, fileContentType, ...data } = input;
      let fileUrl = data.fileUrl;
      let fileKey = data.fileKey;
      let fileChecksum;
      let fileSizeBytes;
      if (fileData) {
        const decoded = decodeDocumentUpload(fileData, fileContentType);
        const duplicate = await fleetDb.document.findFirst({ where: { orgId: ctx.fleetopsUser.orgId, fileChecksum: decoded.checksum } });
        if (duplicate) throw new TRPCError3({ code: "CONFLICT", message: "This exact document file already exists in the organization." });
        const uploaded = await storagePut(`fleetops/documents/${ctx.fleetopsUser.orgId}/${input.title}`, decoded.bytes, fileContentType);
        fileUrl = uploaded.url;
        fileKey = uploaded.key;
        fileChecksum = decoded.checksum;
        fileSizeBytes = decoded.sizeBytes;
      }
      if (!fileUrl) throw new TRPCError3({ code: "BAD_REQUEST", message: "A document file is required." });
      const created = await fleetDb.document.create({ data: { id: crypto.randomUUID(), ...data, fileUrl, fileKey, fileChecksum, fileSizeBytes, retentionUntil: retentionAfterExpiry(input.expiryDate), orgId: ctx.fleetopsUser.orgId, createdAt: /* @__PURE__ */ new Date() } });
      await fleetDb.documentVersion.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, documentId: created.id, versionNumber: 1, title: created.title, docType: created.docType, fileUrl: created.fileUrl, fileKey: created.fileKey, fileChecksum: created.fileChecksum, fileSizeBytes: created.fileSizeBytes, expiryDate: created.expiryDate, createdById: ctx.fleetopsUser.id, createdAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "DOCUMENT_CREATED", entityType: "DOCUMENT", entityId: created.id, summary: `Compliance document added: ${created.title}`, metadata: { docType: created.docType, fileChecksum, fileSizeBytes, malwareScan: "NOT_AVAILABLE_POLICY_RECORDED" } });
      return created;
    }),
    update: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), title: z2.string().min(2).optional(), expiryDate: z2.coerce.date().optional(), fileData: z2.string().max(4e6).optional(), fileContentType: z2.string().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const existing = await fleetDb.document.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!existing) throw new TRPCError3({ code: "NOT_FOUND", message: "Document not found." });
      const { id, fileData, fileContentType, ...data } = input;
      let updateData = { ...data };
      if (fileData) {
        const decoded = decodeDocumentUpload(fileData, fileContentType);
        const duplicate = await fleetDb.document.findFirst({ where: { orgId: ctx.fleetopsUser.orgId, fileChecksum: decoded.checksum } });
        if (duplicate && duplicate.id !== existing.id) throw new TRPCError3({ code: "CONFLICT", message: "This exact replacement file already exists in the organization." });
        const uploaded = await storagePut(`fleetops/documents/${ctx.fleetopsUser.orgId}/${existing.title}`, decoded.bytes, fileContentType);
        updateData = { ...updateData, fileUrl: uploaded.url, fileKey: uploaded.key, fileChecksum: decoded.checksum, fileSizeBytes: decoded.sizeBytes };
      }
      if (input.expiryDate) updateData.retentionUntil = retentionAfterExpiry(input.expiryDate);
      const updated = await fleetDb.document.update({ where: { id }, data: updateData });
      const versions = await fleetDb.documentVersion.findMany({ where: { orgId: ctx.fleetopsUser.orgId, documentId: existing.id }, orderBy: { versionNumber: "desc" }, take: 1 });
      const nextVersion = Number(versions[0]?.versionNumber ?? 0) + 1;
      await fleetDb.documentVersion.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, documentId: updated.id, versionNumber: nextVersion, title: updated.title, docType: updated.docType, fileUrl: updated.fileUrl, fileKey: updated.fileKey, fileChecksum: updated.fileChecksum, fileSizeBytes: updated.fileSizeBytes, expiryDate: updated.expiryDate, createdById: ctx.fleetopsUser.id, createdAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "DOCUMENT_UPDATED", entityType: "DOCUMENT", entityId: existing.id, summary: `Compliance document updated: ${updated.title}`, metadata: { fileChecksum: updateData.fileChecksum, fileSizeBytes: updateData.fileSizeBytes, retentionUntil: updateData.retentionUntil } });
      return updated;
    }),
    archive: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), reason: z2.string().trim().min(3).max(500) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      assertWritable(ctx.fleetopsUser.org);
      const document = await fleetDb.document.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId, archivedAt: null } });
      if (!document) throw new TRPCError3({ code: "NOT_FOUND", message: "Active document not found." });
      const archived = await fleetDb.document.update({ where: { id: document.id }, data: { archivedAt: /* @__PURE__ */ new Date(), archivedById: ctx.fleetopsUser.id } });
      await recordAudit(ctx, { action: "DOCUMENT_ARCHIVED", entityType: "DOCUMENT", entityId: document.id, summary: `Archived compliance document: ${document.title}`, metadata: { reason: input.reason, retentionUntil: document.retentionUntil } });
      return archived;
    }),
    lifecycle: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const rows = await fleetDb.document.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { createdAt: "desc" } });
      const now = Date.now();
      const missingMetadata = rows.filter((row) => !row.fileKey || !row.fileChecksum || !row.fileSizeBytes);
      const retentionExpired = rows.filter((row) => row.retentionUntil && new Date(row.retentionUntil).getTime() < now);
      return { total: rows.length, missingMetadata: missingMetadata.map((row) => row.id), retentionExpired: retentionExpired.map((row) => row.id), malwareScanPolicy: "EXTERNAL_SCAN_REQUIRED_BEFORE_PRODUCTION_UPLOAD", accessLogging: "FILE_ACCESSED audit events enabled" };
    }),
    access: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), kind: z2.enum(["DOCUMENT", "WORK_ORDER_EVIDENCE"]).default("DOCUMENT") })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, input.kind === "DOCUMENT" ? ["SUPERADMIN", "FLEET_MANAGER"] : ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN"]);
      const row = input.kind === "DOCUMENT" ? await fleetDb.document.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } }) : await fleetDb.workOrderEvidence.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!row?.fileKey) throw new TRPCError3({ code: "NOT_FOUND", message: "The requested file is unavailable." });
      await recordAudit(ctx, { action: "FILE_ACCESSED", entityType: input.kind, entityId: input.id, summary: `Authorized file access for ${input.kind.toLowerCase()}` });
      return { url: await storageGetSignedUrl(row.fileKey), expiresInSeconds: 900 };
    })
  }),
  reports: router({
    maintenancePerformance: fleetOpsProcedure.input(z2.object({ from: z2.coerce.date().optional(), to: z2.coerce.date().optional() }).optional()).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "ACCOUNTANT"]);
      const to = input?.to ?? /* @__PURE__ */ new Date();
      const from = input?.from ?? new Date(to.getTime() - 90 * 864e5);
      if (from > to) throw new TRPCError3({ code: "BAD_REQUEST", message: "Report start date must be before end date." });
      const orders = await fleetDb.workOrder.findMany({ where: { orgId: ctx.fleetopsUser.orgId, createdAt: { gte: from, lte: to } }, include: { vehicle: true }, orderBy: { createdAt: "asc" } });
      const completed = orders.filter((order) => order.completedAt);
      const durations = completed.map((order) => Math.max(0, new Date(order.completedAt).getTime() - new Date(order.startedAt ?? order.createdAt).getTime())).filter((value) => Number.isFinite(value));
      const turnaroundHours = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length / 36e5 : 0;
      const downtimeHours = orders.filter((order) => !["COMPLETED", "CANCELLED"].includes(order.status)).reduce((sum, order) => sum + Math.max(0, Date.now() - new Date(order.startedAt ?? order.createdAt).getTime()) / 36e5, 0);
      const titleCounts = /* @__PURE__ */ new Map();
      for (const order of orders) {
        const key = String(order.title).trim().toLowerCase();
        const item = titleCounts.get(key) ?? { title: order.title, count: 0 };
        item.count += 1;
        titleCounts.set(key, item);
      }
      const repeatRepairs = Array.from(titleCounts.values()).filter((item) => item.count > 1).sort((a, b) => b.count - a.count);
      const vehicleCounts = /* @__PURE__ */ new Map();
      for (const order of completed) {
        const item = vehicleCounts.get(order.vehicleId) ?? { vehicleId: order.vehicleId, vehicle: order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId, repairs: 0 };
        item.repairs += 1;
        vehicleCounts.set(order.vehicleId, item);
      }
      return { from, to, totalWorkOrders: orders.length, completedWorkOrders: completed.length, openWorkOrders: orders.filter((order) => !["COMPLETED", "CANCELLED"].includes(order.status)).length, turnaroundHours: Number(turnaroundHours.toFixed(2)), downtimeHours: Number(downtimeHours.toFixed(2)), repeatRepairs, failurePatterns: repeatRepairs.slice(0, 10), vehicleRepairCounts: Array.from(vehicleCounts.values()).sort((a, b) => b.repairs - a.repairs) };
    })
  }),
  financials: router({
    vehicles: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      return fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, select: { id: true, vin: true, licensePlate: true, make: true, model: true, currentOdometer: true }, orderBy: { licensePlate: "asc" } });
    }),
    exportPdf: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid().optional(), type: z2.enum(["REVENUE", "EXPENSE"]).optional(), category: z2.string().optional(), from: z2.coerce.date().optional(), to: z2.coerce.date().optional() }).optional()).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      const where = { orgId: ctx.fleetopsUser.orgId, ...input?.vehicleId ? { vehicleId: input.vehicleId } : {}, ...input?.type ? { type: input.type } : {}, ...input?.category ? { category: input.category } : {}, ...input?.from ? { transactionDate: { gte: input.from } } : {}, ...input?.to ? { transactionDate: { lte: input.to } } : {} };
      const [recordRows, vehicles2] = await Promise.all([fleetDb.financialRecord.findMany({ where, orderBy: { transactionDate: "desc" } }), fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      const rows = recordRows.map((row) => ({ ...row, vehicle: row.vehicleId ? vehicleById.get(row.vehicleId) ?? null : null }));
      const content = simplePdf("VahanSync INR Financial Ledger", [`Organization: ${ctx.fleetopsUser.org.name}`, `Generated: ${(/* @__PURE__ */ new Date()).toLocaleDateString("en-IN")}`, `Records: ${rows.length}`, ...rows.map((row) => `${new Date(row.transactionDate).toLocaleDateString("en-IN")} | ${row.vehicle ? vehicleIdentity(row.vehicle) : row.vehicleId} | ${row.type} | ${row.category} | INR ${Number(row.amount).toFixed(2)}`)]);
      await recordAudit(ctx, { action: "FINANCIAL_EXPORT_PDF", entityType: "FINANCIAL_RECORD", summary: `Exported financial PDF with ${rows.length} records`, metadata: { count: rows.length } });
      return { filename: `vahansync-financial-ledger-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf`, content, rowCount: rows.length };
    }),
    exportCsv: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid().optional(), type: z2.enum(["REVENUE", "EXPENSE"]).optional(), category: z2.string().optional(), from: z2.coerce.date().optional(), to: z2.coerce.date().optional() }).optional()).query(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      const where = { orgId: ctx.fleetopsUser.orgId, ...input?.vehicleId ? { vehicleId: input.vehicleId } : {}, ...input?.type ? { type: input.type } : {}, ...input?.category ? { category: input.category } : {}, ...input?.from ? { transactionDate: { gte: input.from } } : {}, ...input?.to ? { transactionDate: { lte: input.to } } : {} };
      const [recordRows, vehicles2] = await Promise.all([fleetDb.financialRecord.findMany({ where, orderBy: { transactionDate: "desc" } }), fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      const rows = recordRows.map((row) => ({ ...row, vehicle: row.vehicleId ? vehicleById.get(row.vehicleId) ?? null : null }));
      const csv = csvDocument(rows.map((row) => ({ transactionDate: new Date(row.transactionDate).toISOString().slice(0, 10), vehicle: row.vehicle ? vehicleIdentity(row.vehicle) : row.vehicleId, type: row.type, category: row.category, amountInr: Number(row.amount).toFixed(2) })), ["transactionDate", "vehicle", "type", "category", "amountInr"]);
      await recordAudit(ctx, { action: "FINANCIAL_EXPORT_CSV", entityType: "FINANCIAL_RECORD", summary: `Exported ${rows.length} financial records`, metadata: { count: rows.length } });
      return { filename: `vahansync-financial-ledger-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`, content: csv, rowCount: rows.length };
    }),
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      const [records, vehicles2] = await Promise.all([fleetDb.financialRecord.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { transactionDate: "desc" } }), fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      return records.map((record) => ({ ...record, vehicle: record.vehicleId ? vehicleById.get(record.vehicleId) ?? null : null }));
    }),
    metrics: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      const vehicles2 = await fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } });
      const vehicleIds = vehicles2.map((vehicle) => vehicle.id);
      const [records, odometers] = await Promise.all([
        fleetDb.financialRecord.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { transactionDate: "desc" } }),
        vehicleIds.length ? fleetDb.odometerLog.findMany({ where: { vehicleId: { in: vehicleIds } }, orderBy: { createdAt: "asc" } }) : Promise.resolve([])
      ]);
      const byVehicle = /* @__PURE__ */ new Map();
      const expenseBreakdown = /* @__PURE__ */ new Map();
      for (const vehicle of vehicles2) byVehicle.set(vehicle.id, { vehicleId: vehicle.id, vehicle: vehicleIdentity(vehicle), revenue: 0, expenses: 0, firstOdometer: null, lastOdometer: null });
      for (const record of records) {
        const row = byVehicle.get(record.vehicleId);
        if (!row) continue;
        const amount = Number(record.amount);
        if (record.type === "REVENUE") row.revenue += amount;
        else {
          row.expenses += amount;
          const category = String(record.category || "OTHER_EXPENSE");
          expenseBreakdown.set(category, (expenseBreakdown.get(category) ?? 0) + amount);
        }
      }
      for (const log of odometers) {
        const row = byVehicle.get(log.vehicleId);
        if (!row) continue;
        const reading = Number(log.reading);
        if (row.firstOdometer === null) row.firstOdometer = reading;
        row.lastOdometer = reading;
      }
      const rows = Array.from(byVehicle.values()).map((row) => {
        const distanceKm = row.firstOdometer !== null && row.lastOdometer !== null ? Math.max(0, row.lastOdometer - row.firstOdometer) : 0;
        return { ...row, distanceKm, profit: row.revenue - row.expenses, cpk: distanceKm > 0 ? row.expenses / distanceKm : 0 };
      });
      return { rows, totals: { revenue: rows.reduce((s, r) => s + r.revenue, 0), expenses: rows.reduce((s, r) => s + r.expenses, 0), profit: rows.reduce((s, r) => s + r.profit, 0), cpk: rows.reduce((s, r) => s + r.expenses, 0) / Math.max(1, rows.reduce((s, r) => s + r.distanceKm, 0)) }, expenseBreakdown: Array.from(expenseBreakdown.entries()).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount) };
    }),
    reconcile: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      const [vehicles2, fuelLogs2, ledger] = await Promise.all([fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { licensePlate: "asc" } }), fleetDb.fuelLog.findMany({ where: { orgId: ctx.fleetopsUser.orgId } }), fleetDb.financialRecord.findMany({ where: { orgId: ctx.fleetopsUser.orgId, type: "EXPENSE", category: "FUEL" } })]);
      const fuelByVehicle = /* @__PURE__ */ new Map();
      const ledgerByVehicle = /* @__PURE__ */ new Map();
      for (const row of fuelLogs2) fuelByVehicle.set(row.vehicleId, (fuelByVehicle.get(row.vehicleId) ?? 0) + Number(row.amount));
      for (const row of ledger) ledgerByVehicle.set(row.vehicleId, (ledgerByVehicle.get(row.vehicleId) ?? 0) + Number(row.amount));
      const rows = vehicles2.map((vehicle) => {
        const fuelLogged = fuelByVehicle.get(vehicle.id) ?? 0;
        const ledgerFuel = ledgerByVehicle.get(vehicle.id) ?? 0;
        const difference = Math.round((fuelLogged - ledgerFuel) * 100) / 100;
        return { vehicleId: vehicle.id, vehicle: vehicleIdentity(vehicle), fuelLogged, ledgerFuel, difference, status: Math.abs(difference) < 0.01 ? "MATCHED" : "MISMATCH" };
      });
      return { rows, mismatches: rows.filter((row) => row.status === "MISMATCH"), totals: { fuelLogged: rows.reduce((sum, row) => sum + row.fuelLogged, 0), ledgerFuel: rows.reduce((sum, row) => sum + row.ledgerFuel, 0), difference: rows.reduce((sum, row) => sum + row.difference, 0) } };
    }),
    create: fleetOpsProcedure.input(z2.object({ vehicleId: z2.string().uuid(), type: z2.enum(["REVENUE", "EXPENSE"]), category: z2.string().min(2), amount: z2.number().nonnegative(), transactionDate: z2.coerce.date(), taxAmount: z2.number().nonnegative().default(0), gstin: z2.string().trim().max(30).optional(), taxCategory: z2.string().trim().max(80).optional(), invoiceNumber: z2.string().trim().max(120).optional(), vendor: z2.string().trim().max(160).optional(), paymentMethod: z2.string().trim().max(60).optional(), costCenterType: z2.string().trim().max(60).optional(), costCenterId: z2.string().uuid().optional(), tdsAmount: z2.number().nonnegative().default(0) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      assertWritable(ctx.fleetopsUser.org);
      const approvalStatus = input.type === "EXPENSE" && (input.amount >= 1e5 || input.category.toUpperCase().includes("MANUAL")) ? "PENDING_APPROVAL" : "APPROVED";
      const created = await fleetDb.financialRecord.create({ data: { id: crypto.randomUUID(), ...input, amount: input.amount, orgId: ctx.fleetopsUser.orgId, approvalStatus } });
      await recordAudit(ctx, { action: approvalStatus === "PENDING_APPROVAL" ? "FINANCIAL_APPROVAL_REQUIRED" : "FINANCIAL_RECORD_CREATED", entityType: "FINANCIAL_RECORD", entityId: created.id, summary: `${created.type} record added: \u20B9${Number(created.amount).toLocaleString("en-IN")}${approvalStatus === "PENDING_APPROVAL" ? " \xB7 approval required" : ""}`, metadata: { category: created.category, approvalStatus } });
      return created;
    }),
    approvalQueue: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const [records, vehicles2] = await Promise.all([fleetDb.financialRecord.findMany({ where: { orgId: ctx.fleetopsUser.orgId, approvalStatus: "PENDING_APPROVAL" }, orderBy: { transactionDate: "asc" } }), fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } })]);
      const vehicleById = new Map(vehicles2.map((vehicle) => [vehicle.id, vehicle]));
      return records.map((record) => ({ ...record, vehicle: record.vehicleId ? vehicleById.get(record.vehicleId) ?? null : null }));
    }),
    reconcileRecord: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), reconciliationRef: z2.string().trim().min(2).max(160) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      assertWritable(ctx.fleetopsUser.org);
      const existing = await fleetDb.financialRecord.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!existing) throw new TRPCError3({ code: "NOT_FOUND", message: "Financial record not found." });
      const updated = await fleetDb.financialRecord.update({ where: { id: existing.id }, data: { reconciledAt: /* @__PURE__ */ new Date(), reconciliationRef: input.reconciliationRef } });
      await recordAudit(ctx, { action: "FINANCIAL_RECORD_RECONCILED", entityType: "FINANCIAL_RECORD", entityId: existing.id, summary: `Reconciled financial record \u20B9${Number(existing.amount).toLocaleString("en-IN")}`, metadata: { reconciliationRef: input.reconciliationRef } });
      return updated;
    }),
    approve: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), reason: z2.string().min(3) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      assertWritable(ctx.fleetopsUser.org);
      const existing = await fleetDb.financialRecord.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!existing) throw new TRPCError3({ code: "NOT_FOUND", message: "Financial record not found." });
      if (existing.approvalStatus !== "PENDING_APPROVAL") throw new TRPCError3({ code: "BAD_REQUEST", message: "This financial record does not require approval." });
      const approved = await fleetDb.financialRecord.update({ where: { id: existing.id }, data: { approvalStatus: "APPROVED", approvedById: ctx.fleetopsUser.id, approvalReason: input.reason } });
      await recordAudit(ctx, { action: "FINANCIAL_RECORD_APPROVED", entityType: "FINANCIAL_RECORD", entityId: existing.id, summary: `Approved financial record \u20B9${Number(existing.amount).toLocaleString("en-IN")}`, metadata: { reason: input.reason } });
      return approved;
    }),
    reverse: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), reason: z2.string().min(3) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      assertWritable(ctx.fleetopsUser.org);
      const existing = await fleetDb.financialRecord.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!existing) throw new TRPCError3({ code: "NOT_FOUND", message: "Financial record not found." });
      const priorReversal = await fleetDb.financialRecord.findFirst({ where: { orgId: ctx.fleetopsUser.orgId, reversalOfId: existing.id } });
      if (priorReversal) throw new TRPCError3({ code: "CONFLICT", message: "This financial record has already been reversed." });
      const reversal = await fleetDb.financialRecord.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, vehicleId: existing.vehicleId, type: existing.type === "EXPENSE" ? "REVENUE" : "EXPENSE", category: `REVERSAL:${existing.category}`, amount: Number(existing.amount), transactionDate: /* @__PURE__ */ new Date(), approvalStatus: existing.approvalStatus === "APPROVED" ? "APPROVED" : "PENDING_APPROVAL", reversalOfId: existing.id, approvalReason: input.reason } });
      await recordAudit(ctx, { action: "FINANCIAL_RECORD_REVERSED", entityType: "FINANCIAL_RECORD", entityId: existing.id, summary: `Reversed financial record \u20B9${Number(existing.amount).toLocaleString("en-IN")}`, metadata: { reversalId: reversal.id, reason: input.reason } });
      return reversal;
    })
  }),
  billing: router({
    plans: publicProcedure.query(() => {
      const plansData = Object.values(BILLING_PLANS).map((plan) => ({ ...plan, platformFeeInr: plan.platformFeePaise / 100, overageVehicleFeeInr: plan.overageVehicleFeePaise / 100 }));
      console.log("DEBUG: billing.plans returning:", plansData);
      return plansData;
    }),
    status: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const isTrial = ctx.fleetopsUser.org.subscriptionTier === "TRIAL_FREE";
      const plan = BILLING_PLANS[normalizePlan(isTrial ? "STARTER" : ctx.fleetopsUser.org.subscriptionTier)];
      const activeVehicles = await fleetDb.vehicle.count({ where: { orgId: ctx.fleetopsUser.orgId } });
      const bill = calculateMonthlyBill(plan.id, activeVehicles);
      const persistedBillingStatus = ctx.fleetopsUser.org.billingStatus;
      const lifecycle = isTrial ? billingLifecycle(ctx.fleetopsUser.org.trialEndsAt) : persistedBillingStatus ?? "ACTIVE";
      return { tier: plan.id, planName: plan.name, planDescription: plan.description, isTrial, trialEndsAt: ctx.fleetopsUser.org.trialEndsAt, daysRemaining: isTrial ? Math.max(0, Math.ceil((ctx.fleetopsUser.org.trialEndsAt.getTime() - Date.now()) / 864e5)) : 0, maxVehicles: plan.includedVehicles, maxUsers: plan.maxUsers, activeVehicles, overageVehicles: bill.overageVehicles, platformFeePaise: bill.platformFeePaise, overagePaise: bill.overagePaise, estimatedSubtotalPaise: bill.subtotalPaise, lifecycle, currency: "INR", billingReady: false, writeLocked: lifecycle === "SUSPENDED" };
    }),
    invoices: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      return fleetDb.billingInvoice.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { createdAt: "desc" }, take: 12 });
    }),
    payments: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      return fleetDb.billingPayment.findMany({ where: { orgId: ctx.fleetopsUser.orgId }, orderBy: { createdAt: "desc" }, take: 20 });
    }),
    generateInvoice: fleetOpsProcedure.mutation(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const now = /* @__PURE__ */ new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      const plan = BILLING_PLANS[normalizePlan(ctx.fleetopsUser.org.subscriptionTier === "TRIAL_FREE" ? "STARTER" : ctx.fleetopsUser.org.subscriptionTier)];
      const activeVehicles = await fleetDb.vehicle.count({ where: { orgId: ctx.fleetopsUser.orgId } });
      const bill = calculateMonthlyBill(plan.id, activeVehicles);
      const existing = await fleetDb.billingInvoice.findFirst({ where: { orgId: ctx.fleetopsUser.orgId, billingPeriodStart: periodStart } });
      if (existing) return existing;
      const invoice = await fleetDb.billingInvoice.create({ data: { id: crypto.randomUUID(), orgId: ctx.fleetopsUser.orgId, billingPeriodStart: periodStart, billingPeriodEnd: periodEnd, plan: plan.id, billableVehicles: bill.billableVehicles, includedVehicles: plan.includedVehicles, overageVehicles: bill.overageVehicles, platformFeePaise: bill.platformFeePaise, overagePaise: bill.overagePaise, usageAddonsPaise: bill.usageAddonsPaise, creditsPaise: bill.creditsPaise, subtotalPaise: bill.subtotalPaise, taxPaise: 0, totalPaise: bill.subtotalPaise, status: "DRAFT", createdAt: now } });
      await recordAudit(ctx, { action: "BILLING_INVOICE_SNAPSHOT_CREATED", entityType: "BILLING_INVOICE", entityId: invoice.id, summary: `Created ${plan.name} invoice snapshot`, metadata: { billableVehicles: bill.billableVehicles, subtotalPaise: bill.subtotalPaise, billingPeriodStart: periodStart.toISOString() } });
      return invoice;
    }),
    createTestOrder: fleetOpsProcedure.input(z2.object({ invoiceId: z2.string().uuid() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const invoice = await fleetDb.billingInvoice.findFirst({ where: { id: input.invoiceId, orgId: ctx.fleetopsUser.orgId } });
      if (!invoice) throw new TRPCError3({ code: "NOT_FOUND", message: "Invoice not found in this organization" });
      const { keyId } = assertRazorpayTestMode();
      const order = await createRazorpayTestOrder({ amountPaise: Number(invoice.totalPaise), receipt: invoice.id, notes: { orgId: ctx.fleetopsUser.orgId, invoiceId: invoice.id, mode: "TEST" } });
      await recordAudit(ctx, { action: "BILLING_TEST_ORDER_CREATED", entityType: "BILLING_INVOICE", entityId: invoice.id, summary: "Created Razorpay Test Mode order", metadata: { orderId: order.id, amountPaise: order.amount, mode: "TEST" } });
      return { keyId, order };
    })
  }),
  billingTest: router({
    activateStarter: fleetOpsProcedure.mutation(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const { keyId } = assertRazorpayTestMode();
      const plan = BILLING_PLANS.STARTER;
      if (ctx.fleetopsUser.org.subscriptionTier !== "TRIAL_FREE") {
        return { activated: false, alreadyActive: true, tier: ctx.fleetopsUser.org.subscriptionTier, maxVehicles: ctx.fleetopsUser.org.maxVehicles };
      }
      const now = /* @__PURE__ */ new Date();
      const renewalAt = new Date(now);
      renewalAt.setUTCMonth(renewalAt.getUTCMonth() + 1);
      const organization = await fleetDb.organization.update({ where: { id: ctx.fleetopsUser.orgId }, data: { subscriptionTier: plan.id, maxVehicles: plan.includedVehicles, maxUsers: plan.maxUsers, billingStatus: "ACTIVE", subscriptionStartedAt: now, renewalAt, paymentFailedAt: null, suspendedAt: null } });
      await recordAudit(ctx, { action: "BILLING_TEST_PLAN_ACTIVATED", entityType: "ORGANIZATION", entityId: organization.id, summary: "Activated Starter plan in Razorpay Test Mode", metadata: { tier: plan.id, maxVehicles: plan.includedVehicles, maxUsers: plan.maxUsers, razorpayMode: "TEST", keyPrefix: keyId.slice(0, 9) } });
      return { activated: true, alreadyActive: false, tier: plan.id, maxVehicles: plan.includedVehicles, maxUsers: plan.maxUsers, renewalAt };
    })
  }),
  activity: router({
    recent: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "DRIVER"]);
      const [orders, alerts, odometers] = await Promise.all([
        fleetDb.workOrder.findMany({ where: ["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role) ? { orgId: ctx.fleetopsUser.orgId, assignedMechanicId: ctx.fleetopsUser.id } : { orgId: ctx.fleetopsUser.orgId }, include: { vehicle: true }, orderBy: { createdAt: "desc" }, take: 10 }),
        fleetDb.notification.findMany({ where: { orgId: ctx.fleetopsUser.orgId, recipientId: ctx.fleetopsUser.id }, orderBy: { createdAt: "desc" }, take: 10 }),
        fleetDb.odometerLog.findMany({ where: ctx.fleetopsUser.role === "DRIVER" ? { vehicle: { orgId: ctx.fleetopsUser.orgId }, driverId: ctx.fleetopsUser.id } : { vehicle: { orgId: ctx.fleetopsUser.orgId } }, include: { vehicle: true }, orderBy: { createdAt: "desc" }, take: 10 })
      ]);
      return [
        ...orders.map((order) => ({ id: order.id, kind: "work_order", title: order.title, detail: `${order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId} \xB7 ${order.status}`, createdAt: order.createdAt })),
        ...alerts.map((alert) => ({ id: alert.id, kind: "notification", title: alert.title, detail: alert.message, createdAt: alert.createdAt })),
        ...odometers.map((log) => ({ id: log.id, kind: "odometer", title: `Odometer updated \xB7 ${log.vehicle ? vehicleIdentity(log.vehicle) : log.vehicleId}`, detail: `${Number(log.reading).toLocaleString("en-IN")} km${log.isFlagged ? " \xB7 flagged" : ""}`, createdAt: log.createdAt }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
    })
  }),
  notifications: router({
    list: fleetOpsProcedure.input(z2.object({ severity: z2.enum(["ALL", "INFO", "HIGH", "CRITICAL"]).default("ALL"), sourceType: z2.string().trim().max(80).default("ALL"), status: z2.enum(["ALL", "UNREAD", "READ", "OPEN", "RESOLVED"]).default("ALL"), vehicleId: z2.string().uuid().optional() }).optional()).query(async ({ ctx, input }) => {
      const filters = input ?? { severity: "ALL", sourceType: "ALL", status: "ALL" };
      const where = { orgId: ctx.fleetopsUser.orgId, recipientId: ctx.fleetopsUser.id, ...filters.severity !== "ALL" ? { severity: filters.severity } : {}, ...filters.sourceType !== "ALL" ? { sourceType: filters.sourceType } : {}, ...filters.status === "UNREAD" ? { isRead: false } : filters.status === "READ" ? { isRead: true } : filters.status === "OPEN" ? { resolvedAt: null } : filters.status === "RESOLVED" ? { resolvedAt: { not: null } } : {} };
      const notifications2 = await fleetDb.notification.findMany({ where, orderBy: { resolvedAt: "asc", createdAt: "desc" }, take: 100 });
      if (!filters.vehicleId) return notifications2;
      const [vehicles2, orders, issues] = await Promise.all([fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId, id: filters.vehicleId }, select: { id: true } }), fleetDb.workOrder.findMany({ where: { orgId: ctx.fleetopsUser.orgId, vehicleId: filters.vehicleId }, select: { id: true } }), fleetDb.vehicleIssue.findMany({ where: { orgId: ctx.fleetopsUser.orgId, vehicleId: filters.vehicleId }, select: { id: true } })]);
      const references = /* @__PURE__ */ new Set([filters.vehicleId, ...vehicles2.map((row) => row.id), ...orders.map((row) => row.id), ...issues.map((row) => row.id)]);
      return notifications2.filter((notification) => notification.referenceId && references.has(notification.referenceId));
    }),
    sourceDetail: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid() })).query(async ({ ctx, input }) => {
      const notification = await fleetDb.notification.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId, recipientId: ctx.fleetopsUser.id } });
      if (!notification) throw new TRPCError3({ code: "NOT_FOUND", message: "Notification is outside your organization scope." });
      const sourceType = String(notification.sourceType ?? "SYSTEM");
      const source = notification.referenceId && sourceType === "WORK_ORDER" ? await fleetDb.workOrder.findFirst({ where: { id: notification.referenceId, orgId: ctx.fleetopsUser.orgId }, include: { vehicle: true, assignedMechanic: true } }) : notification.referenceId && sourceType === "VEHICLE_ISSUE" ? await fleetDb.vehicleIssue.findFirst({ where: { id: notification.referenceId, orgId: ctx.fleetopsUser.orgId }, include: { vehicle: true } }) : notification.referenceId && sourceType === "VEHICLE" ? await fleetDb.vehicle.findFirst({ where: { id: notification.referenceId, orgId: ctx.fleetopsUser.orgId } }) : notification.referenceId && sourceType === "DOCUMENT_EXPIRY" ? await fleetDb.document.findFirst({ where: { id: notification.referenceId, orgId: ctx.fleetopsUser.orgId }, include: { vehicle: true } }) : notification.referenceId && sourceType === "INVENTORY_LOW" ? await fleetDb.inventoryPart.findFirst({ where: { id: notification.referenceId, orgId: ctx.fleetopsUser.orgId } }) : null;
      return { notification, sourceType, source };
    }),
    markRead: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid() })).mutation(({ ctx, input }) => fleetDb.notification.updateMany({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId, recipientId: ctx.fleetopsUser.id }, data: { isRead: true, acknowledgedAt: /* @__PURE__ */ new Date() } })),
    escalate: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const current = await fleetDb.notification.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!current) throw new TRPCError3({ code: "NOT_FOUND", message: "Notification not found." });
      if (current.resolvedAt) throw new TRPCError3({ code: "BAD_REQUEST", message: "Resolved notifications cannot be escalated." });
      const updated = await fleetDb.notification.update({ where: { id: current.id }, data: { escalationLevel: (current.escalationLevel ?? 0) + 1, isRead: false } });
      await recordAudit(ctx, { action: "NOTIFICATION_ESCALATED", entityType: "NOTIFICATION", entityId: current.id, summary: `Escalated ${current.title}`, metadata: { escalationLevel: updated.escalationLevel, sourceType: current.sourceType } });
      return updated;
    }),
    resolve: fleetOpsProcedure.input(z2.object({ id: z2.string().uuid(), note: z2.string().trim().min(3).max(500) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const current = await fleetDb.notification.findFirst({ where: { id: input.id, orgId: ctx.fleetopsUser.orgId } });
      if (!current) throw new TRPCError3({ code: "NOT_FOUND", message: "Notification not found." });
      if (current.resolvedAt) return current;
      if (current.sourceType === "VEHICLE_ISSUE" && current.referenceId) {
        const issue = await fleetDb.vehicleIssue.findFirst({ where: { id: current.referenceId, orgId: ctx.fleetopsUser.orgId } });
        if (!issue || !["RESOLVED", "CLOSED"].includes(issue.status)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Resolve the source vehicle issue before closing this notification." });
      }
      if (current.sourceType === "WORK_ORDER" && current.referenceId) {
        const order = await fleetDb.workOrder.findFirst({ where: { id: current.referenceId, orgId: ctx.fleetopsUser.orgId } });
        if (!order || order.status !== "COMPLETED") throw new TRPCError3({ code: "BAD_REQUEST", message: "Complete the source work order before closing this notification." });
      }
      if (current.sourceType === "VEHICLE" && current.referenceId) {
        const vehicle = await fleetDb.vehicle.findFirst({ where: { id: current.referenceId, orgId: ctx.fleetopsUser.orgId } });
        if (!vehicle || vehicle.status !== "ACTIVE") throw new TRPCError3({ code: "BAD_REQUEST", message: "Clear the source vehicle before closing this notification." });
      }
      const updated = await fleetDb.notification.update({ where: { id: current.id }, data: { isRead: true, acknowledgedAt: current.acknowledgedAt ?? /* @__PURE__ */ new Date(), resolvedAt: /* @__PURE__ */ new Date() } });
      await recordAudit(ctx, { action: "NOTIFICATION_RESOLVED", entityType: "NOTIFICATION", entityId: current.id, summary: `Resolved ${current.title}`, metadata: { note: input.note, sourceType: current.sourceType, referenceId: current.referenceId } });
      return updated;
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  let fleetopsUser = null;
  try {
    fleetopsUser = await getFleetOpsUserFromRequest(opts.req);
  } catch (error) {
    console.warn("[Supabase] Failed to resolve FleetOps user", error);
  }
  return { req: opts.req, res: opts.res, user, fleetopsUser };
}

// server/_core/static.ts
import express from "express";
import fs from "fs";
import path from "path";
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path.resolve(process.cwd(), "dist", "public") : path.resolve(process.cwd(), "api", "public");
  if (!fs.existsSync(distPath)) {
    console.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

// server/rateLimit.ts
function createRateLimiter(limit = 240, windowMs = 6e4) {
  const buckets = /* @__PURE__ */ new Map();
  return (key, now = Date.now()) => {
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (buckets.size > 1e4) {
        for (const [entryKey, entry] of Array.from(buckets.entries())) if (entry.resetAt <= now) buckets.delete(entryKey);
      }
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterMs: windowMs };
    }
    current.count += 1;
    return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), retryAfterMs: Math.max(0, current.resetAt - now) };
  };
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express3();
  const server = createServer(app);
  app.post("/api/razorpay/webhook", express3.raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
    if (!isRazorpayWebhookEnabled()) {
      res.status(404).json({ error: "Webhook processing is disabled" });
      return;
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!verifyRazorpayWebhook(rawBody, req.header("x-razorpay-signature"))) {
      res.status(400).json({ error: "Invalid webhook signature", requestId: res.locals.requestId ?? "unknown" });
      return;
    }
    const eventId = req.header("x-razorpay-event-id");
    if (!eventId) {
      res.status(400).json({ error: "Missing webhook event id", requestId: res.locals.requestId ?? "unknown" });
      return;
    }
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      res.status(400).json({ error: "Invalid webhook JSON", requestId: res.locals.requestId ?? "unknown" });
      return;
    }
    const orgId = payload.payload?.subscription?.entity?.notes?.orgId;
    if (orgId && ["subscription.activated", "subscription.charged", "subscription.pending", "subscription.halted"].includes(payload.event ?? "")) {
      const billingStatus = payload.event === "subscription.halted" ? "SUSPENDED" : payload.event === "subscription.pending" ? "PAYMENT_GRACE" : "ACTIVE";
      await fleetDb.organization.update({ where: { id: orgId }, data: { billingStatus, paymentFailedAt: billingStatus === "PAYMENT_GRACE" ? /* @__PURE__ */ new Date() : null, suspendedAt: billingStatus === "SUSPENDED" ? /* @__PURE__ */ new Date() : null } });
    }
    res.status(200).json({ received: true, eventId, mode: "TEST" });
  });
  app.use(express3.json({ limit: "50mb" }));
  app.use(express3.urlencoded({ limit: "50mb", extended: true }));
  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") || createRequestId();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });
  const allowApiRequest = createRateLimiter(240, 6e4);
  app.use(
    "/api/trpc",
    (req, res, next) => {
      const result = allowApiRequest(req.ip || req.socket.remoteAddress || "unknown");
      res.setHeader("x-rate-limit-remaining", String(result.remaining));
      if (!result.allowed) {
        res.setHeader("retry-after", String(Math.ceil(result.retryAfterMs / 1e3)));
        res.status(429).json({ error: "Too many requests. Please retry shortly.", requestId: res.locals.requestId });
        return;
      }
      next();
    },
    (req, res, next) => {
      const startedAt = performance.now();
      res.on("finish", () => {
        const durationMs = performance.now() - startedAt;
        if (durationMs >= 1e3) logRequestSignal({ event: "slow_query", requestId: res.locals.requestId ?? "unknown", path: req.path, durationMs });
      });
      next();
    },
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ path: path4, error, req }) => {
        const requestId = req.res?.locals?.requestId ?? "unknown";
        logRequestError({ requestId, path: path4, code: error.code, message: error.message });
        if (error.code === "UNAUTHORIZED") logRequestSignal({ event: "auth_failure", requestId, path: path4, code: error.code, message: error.message });
      }
    })
  );
  if (process.env.NODE_ENV === "development") {
    const { setupVite: setupVite2 } = await Promise.resolve().then(() => (init_vite(), vite_exports));
    await setupVite2(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
