import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeIndianE164Mobile } from "./profile-validation";
import { fleetOpsProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { fleetDb } from "./db";
import {
  getSupabaseAuthIdentity,
  provisionFleetOpsUser,
  supabaseAdmin,
} from "./supabase";
import { storageGetSignedUrl, storagePut } from "./storage";
import { roleCanAct, type FleetRole } from "./role-policy";
import {
  BILLING_PLANS,
  billingLifecycle,
  billingWriteAllowed,
  calculateMonthlyBill,
  normalizePlan,
  validatePlanEligibility,
} from "./billing-plans";
import { assertRazorpayTestMode, createRazorpayTestOrder } from "./razorpay";
import { sendInvitationEmail } from "./invitation-email";
import { vehicleIdentity } from "./vehicle-identity";
const Priority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
const WorkOrderStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export const CITY_BUS_MAINTENANCE_TEMPLATE = [
  { name: "Engine Oil", expectedLifeKm: 10000, alertThresholdKm: 8000 },
  { name: "Brakes", expectedLifeKm: 50000, alertThresholdKm: 40000 },
  { name: "Tires", expectedLifeKm: 60000, alertThresholdKm: 50000 },
] as const;
export const COMPONENT_CATALOG = [
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
  "OTHER",
] as const;
import {
  evaluateAllOrganizations,
  evaluateLowInventory,
  evaluateVehicleMaintenance,
} from "./automation";

export function assertWritable(org: {
  subscriptionTier: string;
  trialEndsAt: Date;
  billingStatus?: string | null;
  paymentFailedAt?: Date | null;
}) {
  if (!billingWriteAllowed(org.billingStatus))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        org.billingStatus === "CANCELLED"
          ? "The subscription is cancelled. Historical data and exports remain available, but operational writes are paused."
          : "Billing is suspended. Historical data and exports remain available, but operational writes are paused until payment is restored.",
    });

  // SECURITY FIX: Validate trial expiration with proper date comparison
  if (org.subscriptionTier === "TRIAL_FREE") {
    const trialExpired =
      org.trialEndsAt && org.trialEndsAt.getTime() < Date.now();
    if (trialExpired) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Your trial has expired. Upgrade your FleetOps plan to continue writing data.",
      });
    }
  }
}

async function assertVehicleCapacity(orgId: string, maxVehicles: number) {
  const count = await fleetDb.vehicle.count({ where: { orgId } });
  if (count >= maxVehicles)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Vehicle limit reached (${maxVehicles}). Upgrade your FleetOps plan to add more vehicles.`,
    });
}

async function assertUserCapacity(orgId: string, maxUsers: number) {
  // User capacity is unlimited in all tiers - no enforced cap
  // Validation is performed at the plan level but doesn't restrict user invitations
  return true;
}

const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

function decodeDocumentUpload(
  fileData: string,
  contentType = "application/octet-stream"
) {
  if (!ALLOWED_DOCUMENT_TYPES.has(contentType))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only PDF, JPEG, PNG, and WebP documents are allowed.",
    });
  const raw = fileData.replace(/^data:[^;]+;base64,/, "");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, "base64");
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The uploaded document is not valid base64 data.",
    });
  }
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Document files must be between 1 byte and 3 MB.",
    });
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return { bytes, checksum, sizeBytes: bytes.length };
}

function retentionAfterExpiry(expiryDate: Date) {
  return new Date(
    Math.max(expiryDate.getTime(), Date.now()) + 7 * 365 * 24 * 60 * 60 * 1000
  );
}

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function findInvitationByToken(
  token: string,
  where: Record<string, unknown> = {}
) {
  const hashed = await fleetDb.invitation.findFirst({
    where: { ...where, tokenHash: hashInvitationToken(token) },
  });
  if (hashed) return hashed;
  return fleetDb.invitation.findFirst({
    where: { ...where, tokenHash: token },
  });
}

export function requireRole(role: string, allowed: readonly string[]) {
  if (!roleCanAct(role, allowed as readonly FleetRole[]))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your role cannot perform this action.",
    });
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csvDocument(rows: Array<Record<string, unknown>>, headers: string[]) {
  return [
    headers.join(","),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(",")),
  ].join("\n");
}
function parseComplianceCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["CSV is empty."] };
  const headers = lines[0].split(",").map(header => header.trim());
  const required = ["title", "docType", "expiryDate", "vehicleId"];
  const missing = required.filter(header => !headers.includes(header));
  if (missing.length)
    return {
      rows: [],
      errors: [`Missing required columns: ${missing.join(", ")}`],
    };
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(",").map(value => value.trim());
    const row = Object.fromEntries(
      headers.map((header, column) => [header, values[column] ?? ""])
    );
    const errors: string[] = [];
    if (!row.title || row.title.length < 2) errors.push("title is required");
    if (
      !["INSURANCE", "RC", "FITNESS", "PERMIT", "DRIVER_LICENSE"].includes(
        row.docType
      )
    )
      errors.push("docType is invalid");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate) ||
      Number.isNaN(new Date(row.expiryDate).getTime())
    )
      errors.push("expiryDate must be YYYY-MM-DD");
    if (!/^[0-9a-f-]{36}$/i.test(row.vehicleId))
      errors.push("vehicleId must be a UUID");
    return { rowNumber: index + 2, row, errors };
  });
  return {
    rows,
    errors: rows.flatMap(item =>
      item.errors.map(error => `Row ${item.rowNumber}: ${error}`)
    ),
  };
}
function parseInventoryCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["CSV is empty."] };
  const headers = lines[0].split(",").map(header => header.trim());
  const required = [
    "sku",
    "name",
    "quantityOnHand",
    "minReorderLevel",
    "unitCost",
  ];
  const missing = required.filter(header => !headers.includes(header));
  if (missing.length)
    return {
      rows: [],
      errors: [`Missing required columns: ${missing.join(", ")}`],
    };
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(",").map(value => value.trim());
    const row = Object.fromEntries(
      headers.map((header, column) => [header, values[column] ?? ""])
    );
    const errors: string[] = [];
    if (!row.sku) errors.push("sku is required");
    if (!row.name || row.name.length < 2) errors.push("name is required");
    for (const field of ["quantityOnHand", "minReorderLevel", "unitCost"])
      if (
        row[field] === "" ||
        Number.isNaN(Number(row[field])) ||
        Number(row[field]) < 0
      )
        errors.push(`${field} must be a non-negative number`);
    return { rowNumber: index + 2, row, errors };
  });
  return {
    rows,
    errors: rows.flatMap(item =>
      item.errors.map(error => `Row ${item.rowNumber}: ${error}`)
    ),
  };
}
function pdfText(value: unknown) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("\n", " ");
}
function simplePdf(title: string, lines: string[]) {
  const content = [
    `BT`,
    `/F1 16 Tf`,
    `50 760 Td`,
    `(${pdfText(title)}) Tj`,
    `/F1 10 Tf`,
    ...lines.flatMap(line => [`0 -18 Td`, `(${pdfText(line)}) Tj`]),
    `ET`,
  ].join("\n");
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map(offset => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n"
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8").toString("base64");
}

async function recordAudit(
  ctx: any,
  event: {
    action: string;
    entityType: string;
    entityId?: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  if (!fleetDb.auditEvent?.create) return undefined;
  try {
    return await fleetDb.auditEvent.create({
      data: {
        id: crypto.randomUUID(),
        orgId: ctx.fleetopsUser.orgId,
        actorId: ctx.fleetopsUser.id,
        actorRole: ctx.fleetopsUser.role,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        summary: event.summary,
        metadata: event.metadata ? JSON.stringify(event.metadata) : undefined,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    // SECURITY FIX: Log audit failures for compliance
    console.error(
      `[AUDIT_ERROR] Failed to record audit event: ${event.action} for ${event.entityType}`,
      error
    );
    return undefined;
  }
}

const FLEETOPS_SERVER_RELEASE = "invite-schema-91663e37";
const INVITATION_TIMEOUT_MS = 12_000;
async function withServerTimeout<T>(
  promise: Promise<T>,
  message: string,
  timeoutMs = INVITATION_TIMEOUT_MS
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new TRPCError({ code: "TIMEOUT", message })),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function createAuthInvitation(email: string, redirectTo: string) {
  const admin = supabaseAdmin.auth.admin as any;
  if (typeof admin.generateLink === "function")
    return admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
  return admin.inviteUserByEmail(email, { redirectTo });
}

async function assignedVehicleIds(ctx: any): Promise<string[]> {
  const rows = await fleetDb.vehicleAssignment.findMany({
    where: {
      orgId: ctx.fleetopsUser.orgId,
      driverId: ctx.fleetopsUser.id,
      active: true,
    },
  });
  return rows.map((row: any) => row.vehicleId).filter(Boolean);
}

async function assertDriverVehicle(ctx: any, vehicleId: string) {
  if (ctx.fleetopsUser.role !== "DRIVER") return;
  const assigned = await fleetDb.vehicleAssignment.findFirst({
    where: {
      orgId: ctx.fleetopsUser.orgId,
      driverId: ctx.fleetopsUser.id,
      vehicleId,
      active: true,
    },
  });
  if (!assigned)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Drivers may only access their currently assigned vehicle.",
    });
}

async function hydrateVehiclesWithComponents(vehicles: any[]) {
  if (!vehicles.length) return vehicles;
  const components = await fleetDb.component.findMany({
    where: { vehicleId: { in: vehicles.map(vehicle => vehicle.id) } },
    orderBy: { name: "asc" },
  });
  const componentsByVehicle = new Map<string, any[]>();
  for (const component of components as any[])
    componentsByVehicle.set(component.vehicleId, [
      ...(componentsByVehicle.get(component.vehicleId) ?? []),
      component,
    ]);
  return vehicles.map(vehicle => ({
    ...vehicle,
    components: componentsByVehicle.get(vehicle.id) ?? [],
  }));
}

async function hydrateWorkOrders(orders: any[], orgId: string) {
  if (!orders.length) return orders;
  const vehicleIds = Array.from(
    new Set(orders.map(order => order.vehicleId).filter(Boolean))
  );
  const assigneeIds = Array.from(
    new Set(orders.map(order => order.assignedMechanicId).filter(Boolean))
  );
  const orderIds = orders.map(order => order.id);

  // FIX: Add error handling for Promise.all() operations
  let vehicles: any[] = [];
  let assignees: any[] = [];
  let partsUsed: any[] = [];

  try {
    const results = await Promise.all([
      vehicleIds.length
        ? fleetDb.vehicle.findMany({ where: { orgId, id: { in: vehicleIds } } })
        : Promise.resolve([]),
      assigneeIds.length
        ? fleetDb.user.findMany({ where: { orgId, id: { in: assigneeIds } } })
        : Promise.resolve([]),
      orderIds.length
        ? fleetDb.workOrderPart.findMany({
            where: { workOrderId: { in: orderIds } },
          })
        : Promise.resolve([]),
    ]);
    vehicles = results[0] || [];
    assignees = results[1] || [];
    partsUsed = results[2] || [];
  } catch (error) {
    console.error("[HYDRATE_ERROR] Failed to hydrate work orders:", error);
    return orders;
  }

  const partIds = Array.from(
    new Set((partsUsed as any[]).map(part => part.partId).filter(Boolean))
  );
  let parts: any[] = [];

  try {
    if (partIds.length) {
      parts = await fleetDb.inventoryPart.findMany({
        where: { orgId, id: { in: partIds } },
      });
    }
  } catch (error) {
    console.error(
      "[HYDRATE_ERROR] Failed to fetch parts for work orders:",
      error
    );
    parts = [];
  }

  const vehicleById = new Map(
    (vehicles as any[]).map(vehicle => [vehicle.id, vehicle])
  );
  const assigneeById = new Map(
    (assignees as any[]).map(assignee => [assignee.id, assignee])
  );
  const partById = new Map((parts as any[]).map(part => [part.id, part]));
  const partsByOrder = new Map<string, any[]>();
  for (const partUse of partsUsed as any[])
    partsByOrder.set(partUse.workOrderId, [
      ...(partsByOrder.get(partUse.workOrderId) ?? []),
      { ...partUse, part: partById.get(partUse.partId) ?? null },
    ]);
  return orders.map(order => {
    const vehicle = vehicleById.get(order.vehicleId);
    const assignedMechanic = order.assignedMechanicId
      ? assigneeById.get(order.assignedMechanicId)
      : null;
    // SECURITY FIX: Validate hydrated objects exist before using
    if (order.vehicleId && !vehicle) {
      console.warn(
        `[WARNING] Vehicle ${order.vehicleId} not found for work order ${order.id}`
      );
    }
    if (order.assignedMechanicId && !assignedMechanic) {
      console.warn(
        `[WARNING] Mechanic ${order.assignedMechanicId} not found for work order ${order.id}`
      );
    }
    return {
      ...order,
      vehicle: vehicle ?? null,
      assignedMechanic,
      partsUsed: partsByOrder.get(order.id) ?? [],
    };
  });
}

export function validateOdometerReading(
  current: number,
  reading: number,
  elapsedDays = 1
) {
  if (reading < current)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Odometer readings cannot move backwards.",
    });
  if (reading - current > Math.max(1, elapsedDays) * 1000)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Odometer increase exceeds the ${Math.max(1, elapsedDays) * 1000} km limit for the elapsed period.`,
    });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.fleetopsUser ?? ctx.user),
    logout: publicProcedure.mutation(() => ({ success: true }) as const),
  }),
  profile: router({
    get: fleetOpsProcedure.query(async ({ ctx }) => {
      const member = await fleetDb.user.findFirst({
        where: { id: ctx.fleetopsUser.id, orgId: ctx.fleetopsUser.orgId },
      });
      if (!member)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Your organization profile could not be found.",
        });
      return {
        id: member.id,
        fullName: member.fullName,
        email: member.email,
        role: member.role,
        organizationName: ctx.fleetopsUser.org.name,
        mobileNumber: member.mobileNumber ?? "",
        smsAlertsEnabled: Boolean(member.smsAlertsEnabled),
        whatsappAlertsEnabled: Boolean(member.whatsappAlertsEnabled),
      };
    }),
    update: fleetOpsProcedure
      .input(
        z.object({
          fullName: z.string().trim().min(2).max(120),
          mobileNumber: z.string().trim(),
          smsAlertsEnabled: z.boolean(),
          whatsappAlertsEnabled: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let mobileNumber: string | null;
        try {
          mobileNumber = normalizeIndianE164Mobile(input.mobileNumber);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "Use an Indian mobile number in +91XXXXXXXXXX format.",
          });
        }
        if (
          (input.smsAlertsEnabled || input.whatsappAlertsEnabled) &&
          !mobileNumber
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Save a mobile number before enabling SMS or WhatsApp alerts.",
          });
        const existing = await fleetDb.user.findFirst({
          where: { id: ctx.fleetopsUser.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Your organization profile could not be found.",
          });
        const now = new Date();
        const member = await fleetDb.user.update({
          where: { id: ctx.fleetopsUser.id },
          data: {
            fullName: input.fullName,
            mobileNumber,
            smsAlertsEnabled: mobileNumber ? input.smsAlertsEnabled : false,
            whatsappAlertsEnabled: mobileNumber
              ? input.whatsappAlertsEnabled
              : false,
            smsOptedInAt:
              mobileNumber && input.smsAlertsEnabled
                ? (existing.smsOptedInAt ?? now)
                : null,
            whatsappOptedInAt:
              mobileNumber && input.whatsappAlertsEnabled
                ? (existing.whatsappOptedInAt ?? now)
                : null,
          },
        });
        const authUser = await getSupabaseAuthIdentity(ctx.req);
        if (authUser) {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(
            authUser.id,
            {
              user_metadata: {
                ...authUser.user_metadata,
                fullName: input.fullName,
              },
            }
          );
          if (error)
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Profile was saved, but Supabase display metadata could not be refreshed: ${error.message}`,
            });
        }
        await recordAudit(ctx, {
          action: "PROFILE_UPDATED",
          entityType: "USER",
          entityId: member.id,
          summary:
            "Member updated their personal profile and alert preferences",
          metadata: {
            fullName: member.fullName,
            smsAlertsEnabled: member.smsAlertsEnabled,
            whatsappAlertsEnabled: member.whatsappAlertsEnabled,
          },
        });
        return member;
      }),
  }),
  organizationSettings: router({
    get: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const existing = await fleetDb.organizationSetting.findFirst({
        where: { orgId: ctx.fleetopsUser.orgId },
      });
      return (
        existing ?? {
          orgId: ctx.fleetopsUser.orgId,
          timezone: "Asia/Kolkata",
          odometerMaxDailyKm: 1000,
          laborRatePerHour: "0",
          safetyContactName: null,
          safetyContactPhone: null,
        }
      );
    }),
    update: fleetOpsProcedure
      .input(
        z.object({
          timezone: z.string().trim().min(3).max(80),
          odometerMaxDailyKm: z.number().int().min(100).max(5000),
          laborRatePerHour: z.number().nonnegative().max(100000).default(0),
          safetyContactName: z.string().trim().max(160).optional(),
          safetyContactPhone: z.string().trim().max(40).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        assertWritable(ctx.fleetopsUser.org);
        const existing = await fleetDb.organizationSetting.findFirst({
          where: { orgId: ctx.fleetopsUser.orgId },
        });
        const settings = existing
          ? await fleetDb.organizationSetting.update({
              where: { id: existing.id },
              data: input,
            })
          : await fleetDb.organizationSetting.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                ...input,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });
        await recordAudit(ctx, {
          action: "ORGANIZATION_SETTINGS_UPDATED",
          entityType: "ORGANIZATION",
          entityId: ctx.fleetopsUser.orgId,
          summary: "Organization operating settings updated",
          metadata: input,
        });
        return settings;
      }),
  }),
  maintenanceTemplates: router({
    list: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      return [
        {
          id: "CITY_BUS",
          name: "City bus preventive maintenance",
          components: CITY_BUS_MAINTENANCE_TEMPLATE,
        },
      ];
    }),
    applyTemplate: fleetOpsProcedure
      .input(
        z.object({
          vehicleId: z.string().uuid(),
          templateId: z.enum(["CITY_BUS"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found in this organization.",
          });
        const existing = await fleetDb.component.findMany({
          where: { vehicleId: vehicle.id },
        });
        const names = new Set(existing.map((item: any) => item.name));
        const added = CITY_BUS_MAINTENANCE_TEMPLATE.filter(
          template => !names.has(template.name)
        );
        await fleetDb.$transaction(async (tx: any) => {
          for (const template of added) {
            await tx.component.create({
              data: {
                id: crypto.randomUUID(),
                vehicleId: vehicle.id,
                name: template.name,
                componentType:
                  template.name === "Engine Oil"
                    ? "OIL_FILTER"
                    : template.name === "Brakes"
                      ? "BRAKE_SYSTEM"
                      : "TIRE",
                installationDate: new Date(),
                expectedLifeKm: template.expectedLifeKm,
                lastServicedOdometer: Number(vehicle.currentOdometer),
                alertThresholdKm: template.alertThresholdKm,
              },
            });
          }
        });
        await recordAudit(ctx, {
          action: "MAINTENANCE_TEMPLATE_APPLIED",
          entityType: "VEHICLE",
          entityId: vehicle.id,
          summary: `Applied CITY_BUS maintenance template to ${vehicleIdentity(vehicle)}`,
          metadata: {
            templateId: input.templateId,
            added: added.map(item => item.name),
            skippedExisting:
              CITY_BUS_MAINTENANCE_TEMPLATE.length - added.length,
          },
        });
        return {
          vehicleId: vehicle.id,
          templateId: input.templateId,
          added: added.length,
          skippedExisting: CITY_BUS_MAINTENANCE_TEMPLATE.length - added.length,
        };
      }),
  }),
  onboarding: router({
    bootstrap: publicProcedure
      .input(
        z.object({
          orgName: z.string().min(2).optional(),
          fullName: z.string().min(2).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const authUser = await getSupabaseAuthIdentity(ctx.req);
        if (!authUser?.email)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "A valid Supabase access token is required.",
          });
        return provisionFleetOpsUser({
          authUserId: authUser.id,
          email: authUser.email,
          fullName:
            input.fullName ??
            String(
              authUser.user_metadata?.fullName ?? authUser.email.split("@")[0]
            ),
          orgName:
            input.orgName ??
            String(
              authUser.user_metadata?.orgName ??
                `${input.fullName ?? authUser.email.split("@")[0]}'s Fleet`
            ),
        });
      }),
    complete: fleetOpsProcedure
      .input(
        z.object({
          orgName: z.string().min(2),
          fullName: z.string().min(2),
          mobileNumber: z.string().trim().optional().default(""),
          smsAlertsEnabled: z.boolean().optional().default(false),
          whatsappAlertsEnabled: z.boolean().optional().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        let mobileNumber: string | null;
        try {
          mobileNumber = normalizeIndianE164Mobile(input.mobileNumber);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "Use an Indian mobile number in +91XXXXXXXXXX format.",
          });
        }
        if (
          (input.smsAlertsEnabled || input.whatsappAlertsEnabled) &&
          !mobileNumber
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Save a mobile number before enabling SMS or WhatsApp alerts.",
          });
        const updated = await fleetDb.$transaction(async (tx: any) => {
          const user = await tx.user.update({
            where: { id: ctx.fleetopsUser.id },
            data: {
              fullName: input.fullName,
              mobileNumber,
              smsAlertsEnabled: mobileNumber ? input.smsAlertsEnabled : false,
              whatsappAlertsEnabled: mobileNumber
                ? input.whatsappAlertsEnabled
                : false,
              smsOptedInAt:
                mobileNumber && input.smsAlertsEnabled ? new Date() : null,
              whatsappOptedInAt:
                mobileNumber && input.whatsappAlertsEnabled ? new Date() : null,
            },
          });
          const org = await tx.organization.update({
            where: { id: ctx.fleetopsUser.orgId },
            data: { name: input.orgName },
          });
          return { user, org };
        });
        const authUser = await getSupabaseAuthIdentity(ctx.req);
        if (!authUser)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Your Supabase session expired. Sign in again to finish onboarding.",
          });
        const { error: metadataError } =
          await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
            user_metadata: {
              ...authUser.user_metadata,
              fullName: input.fullName,
              orgName: input.orgName,
              needsOnboarding: false,
            },
          });
        if (metadataError)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Organization was saved, but onboarding state could not be finalized: ${metadataError.message}`,
          });
        return updated;
      }),
    inviteDetails: publicProcedure
      .input(z.object({ token: z.string().uuid() }))
      .query(async ({ input }) => {
        const invite = await findInvitationByToken(input.token, {
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        });
        if (!invite)
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "This invitation is invalid, expired, or already redeemed.",
          });
        const org = await fleetDb.organization.findFirst({
          where: { id: invite.orgId },
        });
        if (!org)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "The invitation organization no longer exists.",
          });
        return {
          email: invite.email,
          role: invite.role,
          organization: { id: org.id, name: org.name },
          expiresAt: invite.expiresAt,
        };
      }),
    completeInviteWithPassword: publicProcedure
      .input(
        z.object({
          token: z.string().uuid(),
          fullName: z.string().min(2),
          password: z.string().min(8).max(128),
          mobileNumber: z.string().trim().optional().default(""),
          smsAlertsEnabled: z.boolean().optional().default(false),
          whatsappAlertsEnabled: z.boolean().optional().default(false),
        })
      )
      .mutation(async ({ input }) => {
        const invite = await findInvitationByToken(input.token, {
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        });
        if (!invite)
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "This invitation is invalid, expired, or already redeemed.",
          });
        let mobileNumber: string | null;
        try {
          mobileNumber = normalizeIndianE164Mobile(input.mobileNumber);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "Use an Indian mobile number in +91XXXXXXXXXX format.",
          });
        }
        if (
          (input.smsAlertsEnabled || input.whatsappAlertsEnabled) &&
          !mobileNumber
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Save a mobile number before enabling SMS or WhatsApp alerts.",
          });
        const email = invite.email.toLowerCase();
        const existingAuth = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        let authUser = existingAuth.data.users.find(
          user => user.email?.toLowerCase() === email
        );
        let authError = existingAuth.error;
        if (authUser) {
          const updatedAuth = await supabaseAdmin.auth.admin.updateUserById(
            authUser.id,
            {
              password: input.password,
              email_confirm: true,
              user_metadata: {
                ...authUser.user_metadata,
                fullName: input.fullName,
                needsOnboarding: false,
                invitationToken: input.token,
              },
            }
          );
          authUser = updatedAuth.data.user ?? authUser;
          authError = updatedAuth.error;
        } else {
          const createdAuth = await supabaseAdmin.auth.admin.createUser({
            email,
            password: input.password,
            email_confirm: true,
            user_metadata: {
              fullName: input.fullName,
              needsOnboarding: false,
              invitationToken: input.token,
            },
          });
          authUser = createdAuth.data.user ?? undefined;
          authError = createdAuth.error;
        }
        if (authError || !authUser)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `The invited account could not be prepared: ${authError?.message ?? "Auth user was not returned."}`,
          });
        const joined = await fleetDb.$transaction(async (tx: any) => {
          const preferenceData = {
            mobileNumber,
            smsAlertsEnabled: mobileNumber ? input.smsAlertsEnabled : false,
            whatsappAlertsEnabled: mobileNumber
              ? input.whatsappAlertsEnabled
              : false,
            smsOptedInAt:
              mobileNumber && input.smsAlertsEnabled ? new Date() : null,
            whatsappOptedInAt:
              mobileNumber && input.whatsappAlertsEnabled ? new Date() : null,
          };
          const user = await tx.user.upsert({
            where: { authUserId: authUser!.id },
            update: {
              orgId: invite.orgId,
              role: invite.role,
              email,
              fullName: input.fullName,
              ...preferenceData,
            },
            create: {
              authUserId: authUser!.id,
              orgId: invite.orgId,
              role: invite.role,
              email,
              fullName: input.fullName,
              ...preferenceData,
            },
          });
          await tx.invitation.update({
            where: { id: invite.id },
            data: { acceptedAt: new Date() },
          });
          return user;
        });
        const inviteOrg = await fleetDb.organization.findFirst({
          where: { id: invite.orgId },
        });
        const { error: metadataError } =
          await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
            user_metadata: {
              ...authUser.user_metadata,
              fullName: joined.fullName,
              orgId: joined.orgId,
              orgName: inviteOrg?.name,
              role: joined.role,
              needsOnboarding: false,
              invitationToken: undefined,
            },
          });
        if (metadataError)
          console.warn(
            "[Invitation] Membership created; Auth metadata sync will be retried from the database-backed profile.",
            {
              authUserId: authUser.id,
              orgId: joined.orgId,
              reason: metadataError.message,
            }
          );
        return {
          email,
          role: joined.role,
          organizationName: inviteOrg?.name ?? "",
          metadataSyncPending: Boolean(metadataError),
        };
      }),
    acceptInvite: publicProcedure
      .input(
        z.object({
          token: z.string().uuid(),
          fullName: z.string().min(2).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const authUser = await getSupabaseAuthIdentity(ctx.req);
        if (!authUser?.email)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "A valid Supabase access token is required.",
          });
        const invite = await findInvitationByToken(input.token, {
          email: authUser.email,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        });
        if (!invite)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invitation is invalid, expired, or already redeemed.",
          });
        const user = await fleetDb.$transaction(async (tx: any) => {
          const joined = await tx.user.upsert({
            where: { authUserId: authUser.id },
            update: {
              orgId: invite.orgId,
              role: invite.role,
              email: authUser.email!,
              fullName:
                input.fullName ??
                String(
                  authUser.user_metadata?.fullName ??
                    authUser.email!.split("@")[0]
                ),
            },
            create: {
              authUserId: authUser.id,
              orgId: invite.orgId,
              role: invite.role,
              email: authUser.email!,
              fullName:
                input.fullName ??
                String(
                  authUser.user_metadata?.fullName ??
                    authUser.email!.split("@")[0]
                ),
            },
          });
          await tx.invitation.update({
            where: { id: invite.id },
            data: { acceptedAt: new Date() },
          });
          return joined;
        });
        const inviteOrg = await fleetDb.organization.findFirst({
          where: { id: invite.orgId },
        });
        const { error: metadataError } =
          await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
            user_metadata: {
              ...authUser.user_metadata,
              fullName: user.fullName,
              orgId: user.orgId,
              orgName: inviteOrg?.name,
              role: user.role,
              needsOnboarding: false,
              invitationToken: undefined,
            },
          });
        if (metadataError)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Organization membership was created, but the session metadata could not be finalized: ${metadataError.message}`,
          });
        return user;
      }),
  }),
  dashboard: router({
    summary: fleetOpsProcedure.query(async ({ ctx }) => {
      const orgId = ctx.fleetopsUser.orgId;
      let vehicles: any[] = [];
      let openWorkOrders = 0;
      let inventoryAlerts = 0;
      let unreadNotifications = 0;
      let monthlyExpense = 0;

      // FIX: Add error handling for Promise.all() in dashboard summary
      try {
        const [vehicleRows, woCount, invCount, notifCount, spend] =
          await Promise.all([
            fleetDb.vehicle.findMany({
              where: { orgId },
              orderBy: { updatedAt: "desc" },
              take: 10,
            }),
            fleetDb.workOrder.count({
              where: {
                orgId,
                status: {
                  in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS],
                },
              },
            }),
            fleetDb.inventoryPart.count({
              where: { orgId, quantityOnHand: { lte: 5 } },
            }),
            fleetDb.notification.count({
              where: { orgId, recipientId: ctx.fleetopsUser.id, isRead: false },
            }),
            fleetDb.financialRecord.aggregate({
              where: { orgId, type: "EXPENSE" },
              _sum: { amount: true },
            }),
          ]);
        vehicles = vehicleRows;
        openWorkOrders = woCount;
        inventoryAlerts = invCount;
        unreadNotifications = notifCount;
        monthlyExpense = spend._sum.amount ?? 0;
      } catch (error) {
        console.error(
          "[DASHBOARD_ERROR] Failed to load dashboard summary:",
          error
        );
      }

      const authUser = await getSupabaseAuthIdentity(ctx.req);
      const defaultOrgName = `${ctx.fleetopsUser.fullName}'s Fleet`;
      const needsOnboarding =
        authUser?.user_metadata?.needsOnboarding === true ||
        authUser?.user_metadata?.needsOnboarding === "true" ||
        ctx.fleetopsUser.org.name === defaultOrgName;
      return {
        org: ctx.fleetopsUser.org,
        role: ctx.fleetopsUser.role,
        needsOnboarding,
        vehicles,
        openWorkOrders,
        inventoryAlerts,
        unreadNotifications,
        monthlyExpense,
      };
    }),
  }),
  components: router({
    list: fleetOpsProcedure
      .input(z.object({ vehicleId: z.string().uuid().optional() }).optional())
      .query(({ ctx, input }) =>
        fleetDb.component.findMany({
          where: {
            vehicle: { orgId: ctx.fleetopsUser.orgId },
            ...(input?.vehicleId ? { vehicleId: input.vehicleId } : {}),
          },
          orderBy: { name: "asc" },
        })
      ),
    create: fleetOpsProcedure
      .input(
        z.object({
          vehicleId: z.string().uuid(),
          inventoryPartId: z.string().uuid().optional(),
          name: z.string().min(2),
          componentType: z.enum(COMPONENT_CATALOG).default("OTHER"),
          componentSubtype: z.string().trim().max(120).optional(),
          brand: z.string().trim().max(120).optional(),
          partNumber: z.string().trim().max(120).optional(),
          serialNumber: z.string().trim().max(120).optional(),
          installationDate: z.coerce.date().optional(),
          expectedLifeKm: z.number().positive(),
          expectedLifeDays: z.number().int().positive().optional(),
          lastServicedOdometer: z.number().nonnegative(),
          alertThresholdKm: z.number().positive(),
          alertThresholdDays: z.number().int().positive().optional(),
          notes: z.string().trim().max(2000).optional(),
          status: z.enum(["ACTIVE", "REPLACED", "REMOVED"]).default("ACTIVE"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "SUPERADMIN",
          "FLEET_MANAGER",
          "MECHANIC",
        ]);
        assertWritable(ctx.fleetopsUser.org);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found.",
          });
        if (input.inventoryPartId) {
          const part = await fleetDb.inventoryPart.findFirst({
            where: { id: input.inventoryPartId, orgId: ctx.fleetopsUser.orgId },
          });
          if (!part)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Linked inventory part is outside this organization.",
            });
        }
        const created = await fleetDb.component.create({
          data: {
            id: crypto.randomUUID(),
            ...input,
            installationDate: input.installationDate ?? new Date(),
          },
        });
        await recordAudit(ctx, {
          action: "COMPONENT_CREATED",
          entityType: "COMPONENT",
          entityId: created.id,
          summary: `${created.name} installed on ${vehicleIdentity(vehicle)}`,
          metadata: {
            vehicleId: vehicle.id,
            componentType: created.componentType,
            inventoryPartId: created.inventoryPartId,
            expectedLifeKm: created.expectedLifeKm,
            expectedLifeDays: created.expectedLifeDays,
            lastServicedOdometer: created.lastServicedOdometer,
            alertThresholdKm: created.alertThresholdKm,
            alertThresholdDays: created.alertThresholdDays,
          },
        });
        await evaluateVehicleMaintenance(vehicle.id, ctx.fleetopsUser.orgId);
        return created;
      }),
    update: fleetOpsProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          inventoryPartId: z.string().uuid().nullable().optional(),
          name: z.string().min(2).optional(),
          componentType: z.enum(COMPONENT_CATALOG).optional(),
          componentSubtype: z.string().trim().max(120).nullable().optional(),
          brand: z.string().trim().max(120).nullable().optional(),
          partNumber: z.string().trim().max(120).nullable().optional(),
          serialNumber: z.string().trim().max(120).nullable().optional(),
          installationDate: z.coerce.date().optional(),
          expectedLifeKm: z.number().positive().optional(),
          expectedLifeDays: z.number().int().positive().nullable().optional(),
          lastServicedOdometer: z.number().nonnegative().optional(),
          alertThresholdKm: z.number().positive().optional(),
          alertThresholdDays: z.number().int().positive().nullable().optional(),
          notes: z.string().trim().max(2000).nullable().optional(),
          status: z.enum(["ACTIVE", "REPLACED", "REMOVED"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "SUPERADMIN",
          "FLEET_MANAGER",
          "MECHANIC",
        ]);
        assertWritable(ctx.fleetopsUser.org);
        const component = await fleetDb.component.findFirst({
          where: { id: input.id, vehicle: { orgId: ctx.fleetopsUser.orgId } },
        });
        if (!component)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Component not found.",
          });
        const { id, ...data } = input;
        const updated = await fleetDb.component.update({ where: { id }, data });
        await recordAudit(ctx, {
          action:
            Number(updated.lastServicedOdometer) !==
            Number(component.lastServicedOdometer)
              ? "COMPONENT_SERVICE_BASELINE_RESET"
              : "COMPONENT_UPDATED",
          entityType: "COMPONENT",
          entityId: updated.id,
          summary: `Component ${updated.name} updated`,
          metadata: {
            vehicleId: updated.vehicleId,
            componentType: updated.componentType,
            inventoryPartId: updated.inventoryPartId,
            previousLastServicedOdometer: component.lastServicedOdometer,
            lastServicedOdometer: updated.lastServicedOdometer,
            previousExpectedLifeKm: component.expectedLifeKm,
            expectedLifeKm: updated.expectedLifeKm,
            expectedLifeDays: updated.expectedLifeDays,
            alertThresholdKm: updated.alertThresholdKm,
            alertThresholdDays: updated.alertThresholdDays,
            status: updated.status,
          },
        });
        await evaluateVehicleMaintenance(
          component.vehicleId,
          ctx.fleetopsUser.orgId
        );
        return updated;
      }),
    remove: fleetOpsProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const component = await fleetDb.component.findFirst({
          where: { id: input.id, vehicle: { orgId: ctx.fleetopsUser.orgId } },
        });
        if (!component)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Component not found.",
          });
        const deleted = await fleetDb.component.delete({
          where: { id: input.id },
        });
        await recordAudit(ctx, {
          action: "COMPONENT_REMOVED",
          entityType: "COMPONENT",
          entityId: component.id,
          summary: `Component ${component.name} removed`,
          metadata: {
            vehicleId: component.vehicleId,
            lastServicedOdometer: component.lastServicedOdometer,
            expectedLifeKm: component.expectedLifeKm,
            alertThresholdKm: component.alertThresholdKm,
          },
        });
        return deleted;
      }),
  }),
  vehicles: router({
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, [
        "SUPERADMIN",
        "FLEET_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
        "DRIVER",
      ]);
      const where =
        ctx.fleetopsUser.role === "DRIVER"
          ? {
              orgId: ctx.fleetopsUser.orgId,
              id: { in: await assignedVehicleIds(ctx) },
            }
          : { orgId: ctx.fleetopsUser.orgId };
      const vehicleRows = await fleetDb.vehicle.findMany({
        where,
        orderBy: { updatedAt: "desc" },
      });
      const vehicles = await hydrateVehiclesWithComponents(
        vehicleRows as any[]
      );
      if (!vehicles.length) return vehicles;
      const logs = await fleetDb.odometerLog.findMany({
        where: {
          vehicleId: { in: vehicles.map((vehicle: any) => vehicle.id) },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(vehicles.length * 8, 200),
      });
      const latestByVehicle = new Map<string, any>();
      for (const log of logs as any[])
        if (!latestByVehicle.has(log.vehicleId))
          latestByVehicle.set(log.vehicleId, log);
      return vehicles.map((vehicle: any) => {
        const latest = latestByVehicle.get(vehicle.id);
        return {
          ...vehicle,
          latestOdometerReading: latest?.reading ?? vehicle.currentOdometer,
          latestOdometerAt: latest?.createdAt ?? vehicle.updatedAt,
          latestOdometerSource: latest?.source ?? "VEHICLE_RECORD",
        };
      });
    }),
    create: fleetOpsProcedure
      .input(
        z.object({
          vin: z.string().trim().min(5).max(32),
          licensePlate: z.string().trim().min(3).max(32),
          chassisNumber: z.string().trim().max(80).optional(),
          engineNumber: z.string().trim().max(80).optional(),
          vehicleType: z
            .enum(["BUS", "MINIBUS", "TRUCK", "VAN", "CAR", "OTHER"])
            .optional(),
          assignedRoute: z.string().trim().max(120).optional(),
          depotLocation: z.string().trim().max(120).optional(),
          make: z.string().trim().min(2),
          model: z.string().trim().min(2),
          year: z.number().int().min(1980).max(2100),
          currentOdometer: z.number().min(0).default(0),
          maintenanceTemplate: z.enum(["NONE", "CITY_BUS"]).default("NONE"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        await assertVehicleCapacity(
          ctx.fleetopsUser.orgId,
          ctx.fleetopsUser.org.maxVehicles
        );
        const count = await fleetDb.vehicle.count({
          where: { orgId: ctx.fleetopsUser.orgId },
        });
        if (
          ctx.fleetopsUser.org.subscriptionTier === "TRIAL_FREE" &&
          count >= ctx.fleetopsUser.org.maxVehicles
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Trial limit reached: maximum 3 vehicles.",
          });
        const { maintenanceTemplate, ...vehicleInput } = input;
        const vin = input.vin.toUpperCase();
        const licensePlate = input.licensePlate.toUpperCase();
        const existingVehicles = await fleetDb.vehicle.findMany({
          where: { orgId: ctx.fleetopsUser.orgId },
        });
        if (
          (existingVehicles as any[]).some(
            item => String(item.vin).toUpperCase() === vin
          )
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A vehicle with this VIN already exists in the organization.",
          });
        if (
          (existingVehicles as any[]).some(
            item => String(item.licensePlate).toUpperCase() === licensePlate
          )
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A vehicle with this registration number already exists in the organization.",
          });
        const vehicle = await fleetDb.vehicle.create({
          data: {
            id: crypto.randomUUID(),
            ...vehicleInput,
            vin,
            licensePlate,
            status: "ACTIVE",
            orgId: ctx.fleetopsUser.orgId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        if (maintenanceTemplate === "CITY_BUS") {
          const odometer = Number(input.currentOdometer ?? 0);
          await Promise.all(
            CITY_BUS_MAINTENANCE_TEMPLATE.map(template =>
              fleetDb.component.create({
                data: {
                  id: crypto.randomUUID(),
                  vehicleId: vehicle.id,
                  name: template.name,
                  expectedLifeKm: template.expectedLifeKm,
                  lastServicedOdometer: odometer,
                  alertThresholdKm: template.alertThresholdKm,
                },
              })
            )
          );
        }
        await recordAudit(ctx, {
          action: "VEHICLE_CREATED",
          entityType: "VEHICLE",
          entityId: vehicle.id,
          summary: `${vehicleIdentity(vehicle)} added to the fleet`,
          metadata: {
            maintenanceTemplate,
            vin: vehicle.vin,
            licensePlate: vehicle.licensePlate,
            vehicleType: vehicle.vehicleType,
            assignedRoute: vehicle.assignedRoute,
            depotLocation: vehicle.depotLocation,
          },
        });
        return { ...vehicle, maintenanceTemplate };
      }),
    update: fleetOpsProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          vin: z.string().trim().min(5).max(32),
          licensePlate: z.string().trim().min(3).max(32),
          chassisNumber: z.string().trim().max(80).nullable().optional(),
          engineNumber: z.string().trim().max(80).nullable().optional(),
          vehicleType: z
            .enum(["BUS", "MINIBUS", "TRUCK", "VAN", "CAR", "OTHER"])
            .nullable()
            .optional(),
          assignedRoute: z.string().trim().max(120).nullable().optional(),
          depotLocation: z.string().trim().max(120).nullable().optional(),
          make: z.string().trim().min(2),
          model: z.string().trim().min(2),
          year: z.number().int().min(1980).max(2100),
          currentOdometer: z.number().min(0),
          status: z
            .enum(["ACTIVE", "OUT_OF_SERVICE", "MAINTENANCE"])
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found in your organization.",
          });
        const vin = input.vin.toUpperCase();
        const licensePlate = input.licensePlate.toUpperCase();
        const existingVehicles = await fleetDb.vehicle.findMany({
          where: { orgId: ctx.fleetopsUser.orgId },
        });
        if (
          (existingVehicles as any[]).some(
            item =>
              item.id !== vehicle.id && String(item.vin).toUpperCase() === vin
          )
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "Another vehicle already uses this VIN.",
          });
        if (
          (existingVehicles as any[]).some(
            item =>
              item.id !== vehicle.id &&
              String(item.licensePlate).toUpperCase() === licensePlate
          )
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "Another vehicle already uses this registration number.",
          });
        const { id, ...data } = input;
        const updated = await fleetDb.vehicle.update({
          where: { id },
          data: { ...data, vin, licensePlate },
        });
        if (Number(input.currentOdometer) > Number(vehicle.currentOdometer))
          await evaluateVehicleMaintenance(vehicle.id, ctx.fleetopsUser.orgId);
        await recordAudit(ctx, {
          action: "VEHICLE_UPDATED",
          entityType: "VEHICLE",
          entityId: vehicle.id,
          summary: `${vehicleIdentity(updated)} details updated`,
          metadata: {
            previousOdometer: vehicle.currentOdometer,
            currentOdometer: updated.currentOdometer,
            vin: updated.vin,
            licensePlate: updated.licensePlate,
          },
        });
        return updated;
      }),
    remove: fleetOpsProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found in your organization.",
          });
        const deleted = await fleetDb.vehicle.delete({
          where: { id: vehicle.id },
        });
        await recordAudit(ctx, {
          action: "VEHICLE_DELETED",
          entityType: "VEHICLE",
          entityId: vehicle.id,
          summary: `${vehicleIdentity(vehicle)} deleted from the fleet`,
          metadata: { vin: vehicle.vin, licensePlate: vehicle.licensePlate },
        });
        return deleted;
      }),
    odometerHistory: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER"]);
      return fleetDb.odometerLog.findMany({
        where: { vehicle: { orgId: ctx.fleetopsUser.orgId } },
        include: { vehicle: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }),
    health: fleetOpsProcedure
      .input(z.object({ vehicleId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "SUPERADMIN",
          "FLEET_MANAGER",
          "MECHANIC",
          "TECHNICIAN",
          "DRIVER",
        ]);
        await assertDriverVehicle(ctx, input.vehicleId);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found in your organization scope.",
          });

        // FIX: Add error handling for Promise.all() in vehicle health
        let components: any[] = [];
        let odometers: any[] = [];
        let workOrders: any[] = [];
        let documents: any[] = [];

        try {
          const [comps, odoms, wos, docs] = await Promise.all([
            fleetDb.component.findMany({
              where: { vehicleId: vehicle.id },
              orderBy: { name: "asc" },
            }),
            fleetDb.odometerLog.findMany({
              where: {
                vehicleId: vehicle.id,
                vehicle: { orgId: ctx.fleetopsUser.orgId },
              },
              orderBy: { createdAt: "desc" },
              take: 12,
            }),
            fleetDb.workOrder.findMany({
              where: {
                vehicleId: vehicle.id,
                orgId: ctx.fleetopsUser.orgId,
                ...(["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
                  ? { assignedMechanicId: ctx.fleetopsUser.id }
                  : {}),
              },
              orderBy: { updatedAt: "desc" },
              take: 12,
            }),
            fleetDb.document.findMany({
              where: { vehicleId: vehicle.id, orgId: ctx.fleetopsUser.orgId },
              orderBy: { expiryDate: "asc" },
              take: 12,
            }),
          ]);
          components = comps;
          odometers = odoms;
          workOrders = await hydrateWorkOrders(
            wos as any[],
            ctx.fleetopsUser.orgId
          );
          documents = docs;
        } catch (error) {
          console.error(
            "[VEHICLE_HEALTH_ERROR] Failed to load vehicle health:",
            error
          );
        }

        const dueComponents = (components as any[]).filter(
          (item: any) =>
            Number(vehicle.currentOdometer) -
              Number(item.lastServicedOdometer) >=
            Number(item.alertThresholdKm)
        );
        const dueDocuments = documents.filter(
          (item: any) =>
            new Date(item.expiryDate).getTime() < Date.now() + 30 * 86_400_000
        );
        return {
          vehicle: { ...vehicle, components },
          odometers,
          workOrders,
          documents,
          health: {
            componentCount: components.length,
            dueComponents: dueComponents.length,
            openWorkOrders: workOrders.filter(
              (item: any) => !["COMPLETED", "CANCELLED"].includes(item.status)
            ).length,
            dueDocuments: dueDocuments.length,
            readiness:
              vehicle.status === "ACTIVE" &&
              dueComponents.length === 0 &&
              dueDocuments.length === 0
                ? "READY"
                : "REVIEW",
          },
        };
      }),
    updateOdometer: fleetOpsProcedure
      .input(
        z.object({
          vehicleId: z.string().uuid(),
          reading: z.number().min(0),
          source: z.enum(["MANUAL_DRIVER", "GPS_API", "MECHANIC"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        assertWritable(ctx.fleetopsUser.org);
        requireRole(ctx.fleetopsUser.role, [
          "SUPERADMIN",
          "FLEET_MANAGER",
          "MECHANIC",
          "TECHNICIAN",
          "DRIVER",
        ]);
        await assertDriverVehicle(ctx, input.vehicleId);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found.",
          });
        const current = Number(vehicle.currentOdometer);
        const previousLog = await fleetDb.odometerLog.findFirst({
          where: { vehicleId: vehicle.id },
          orderBy: { createdAt: "desc" },
        });
        const elapsedDays = previousLog?.createdAt
          ? Math.max(
              1,
              Math.ceil(
                (Date.now() - new Date(previousLog.createdAt).getTime()) /
                  86_400_000
              )
            )
          : 1;
        const baseline = Math.max(
          current,
          previousLog ? Number(previousLog.reading) : current
        );
        validateOdometerReading(baseline, input.reading, elapsedDays);
        const isFlagged = false;
        const { updatedVehicle, odometerLog } = await fleetDb.$transaction(
          async (tx: any) => {
            const updatedVehicle = await tx.vehicle.update({
              where: { id: vehicle.id },
              data: { currentOdometer: input.reading },
            });
            const odometerLog = await tx.odometerLog.create({
              data: {
                id: crypto.randomUUID(),
                vehicleId: vehicle.id,
                driverId: ctx.fleetopsUser.id,
                reading: input.reading,
                source: input.source,
                isFlagged,
                createdAt: new Date(),
              },
            });
            return { updatedVehicle, odometerLog };
          }
        );
        await evaluateVehicleMaintenance(vehicle.id, ctx.fleetopsUser.orgId);
        await recordAudit(ctx, {
          action: "ODOMETER_READING_UPDATED",
          entityType: "VEHICLE",
          entityId: vehicle.id,
          summary: `Odometer reading updated to ${input.reading} km for ${vehicleIdentity(vehicle)}`,
          metadata: {
            previousReading: current,
            newReading: input.reading,
            source: input.source,
          },
        });
        return { vehicle: updatedVehicle, odometerLog };
      }),
  }),
  planning: router({
    maintenance: fleetOpsProcedure
      .input(
        z
          .object({
            from: z.coerce.date().optional(),
            to: z.coerce.date().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        const from = input?.from ?? new Date();
        const to = input?.to ?? new Date(from.getTime() + 90 * 86_400_000);
        if (to < from)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The planning end date must be on or after the start date.",
          });

        // FIX: Add error handling for Promise.all() in maintenance planning
        let vehicles: any[] = [];
        let documentRows: any[] = [];
        let workOrderRows: any[] = [];

        try {
          const [vRows, dRows, woRows] = await Promise.all([
            fleetDb.vehicle.findMany({
              where: { orgId: ctx.fleetopsUser.orgId },
              orderBy: { licensePlate: "asc" },
            }),
            fleetDb.document.findMany({
              where: { orgId: ctx.fleetopsUser.orgId },
              orderBy: { expiryDate: "asc" },
            }),
            fleetDb.workOrder.findMany({
              where: {
                orgId: ctx.fleetopsUser.orgId,
                status: {
                  in: [
                    "OPEN",
                    "IN_PROGRESS",
                    "WAITING_FOR_PARTS",
                    "READY_FOR_REVIEW",
                    "REWORK",
                  ],
                },
              },
              orderBy: { updatedAt: "desc" },
            }),
          ]);
          vehicles = await hydrateVehiclesWithComponents(vRows as any[]);
          documentRows = dRows;
          workOrderRows = woRows;
        } catch (error) {
          console.error(
            "[PLANNING_ERROR] Failed to load maintenance planning:",
            error
          );
        }

        const vehicleById = new Map(
          (vehicles as any[]).map(vehicle => [vehicle.id, vehicle])
        );
        const documents = (documentRows as any[]).map(document => ({
          ...document,
          vehicle: document.vehicleId
            ? (vehicleById.get(document.vehicleId) ?? null)
            : null,
        }));
        const workOrders = await hydrateWorkOrders(
          workOrderRows as any[],
          ctx.fleetopsUser.orgId
        );
        const items = [
          ...vehicles.flatMap((vehicle: any) =>
            (vehicle.components ?? [])
              .filter(
                (component: any) =>
                  Number(vehicle.currentOdometer) -
                    Number(component.lastServicedOdometer) >=
                  Number(component.alertThresholdKm)
              )
              .map((component: any) => ({
                id: component.id,
                kind: "COMPONENT_DUE" as const,
                title: `${component.name} service due`,
                vehicleId: vehicle.id,
                vehicleLabel: vehicleIdentity(vehicle),
                dueDate: new Date(),
                priority: "HIGH",
                detail: `${Math.max(0, Number(vehicle.currentOdometer) - Number(component.lastServicedOdometer)).toLocaleString("en-IN")} km since last service`,
                sourceId: component.id,
              }))
          ),
          ...documents
            .filter((document: any) => {
              const due = new Date(document.expiryDate);
              return due >= from && due <= to;
            })
            .map((document: any) => ({
              id: document.id,
              kind: "DOCUMENT_EXPIRY" as const,
              title: `${document.title} expires`,
              vehicleId: document.vehicleId ?? null,
              vehicleLabel: document.vehicle
                ? vehicleIdentity(document.vehicle)
                : "Organization document",
              dueDate: new Date(document.expiryDate),
              priority:
                new Date(document.expiryDate).getTime() <
                Date.now() + 30 * 86_400_000
                  ? "CRITICAL"
                  : "MEDIUM",
              detail: `${document.docType ?? "Document"} renewal required`,
              sourceId: document.id,
            })),
          ...workOrders
            .filter((order: any) => {
              const due = new Date(order.updatedAt ?? order.createdAt);
              return due >= from && due <= to;
            })
            .map((order: any) => ({
              id: order.id,
              kind: "WORK_ORDER" as const,
              title: order.title,
              vehicleId: order.vehicleId,
              vehicleLabel: order.vehicle
                ? vehicleIdentity(order.vehicle)
                : order.vehicleId,
              dueDate: new Date(order.updatedAt ?? order.createdAt),
              priority: order.priority,
              detail: `${order.status} · ${order.assignedMechanic?.fullName ?? "Unassigned"}`,
              sourceId: order.id,
            })),
        ].sort(
          (a, b) =>
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        );
        return {
          from,
          to,
          items,
          counts: {
            total: items.length,
            components: items.filter(item => item.kind === "COMPONENT_DUE")
              .length,
            documents: items.filter(item => item.kind === "DOCUMENT_EXPIRY")
              .length,
            workOrders: items.filter(item => item.kind === "WORK_ORDER").length,
          },
        };
      }),
  }),
  workOrders: router({
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, [
        "SUPERADMIN",
        "FLEET_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
      ]);
      const where = ["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
        ? {
            orgId: ctx.fleetopsUser.orgId,
            assignedMechanicId: ctx.fleetopsUser.id,
          }
        : { orgId: ctx.fleetopsUser.orgId };
      const orders = await fleetDb.workOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
      return hydrateWorkOrders(orders as any[], ctx.fleetopsUser.orgId);
    }),
    detail: fleetOpsProcedure
      .input(z.object({ workOrderId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "SUPERADMIN",
          "FLEET_MANAGER",
          "MECHANIC",
          "TECHNICIAN",
          "ACCOUNTANT",
        ]);
        const order = await fleetDb.workOrder.findFirst({
          where: {
            id: input.workOrderId,
            orgId: ctx.fleetopsUser.orgId,
            ...(["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
              ? { assignedMechanicId: ctx.fleetopsUser.id }
              : {}),
          },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Work order is outside your organization or role scope.",
          });

        // FIX: Add error handling for Promise.all() in work order detail
        let hydratedOrder: any = null;
        let vehicleComponents: any[] = [];
        let evidence: any[] = [];
        let activity: any[] = [];

        try {
          const [hydratedRows, components, evid, act] = await Promise.all([
            hydrateWorkOrders([order], ctx.fleetopsUser.orgId),
            fleetDb.component.findMany({
              where: { vehicleId: order.vehicleId },
              orderBy: { name: "asc" },
            }),
            fleetDb.workOrderEvidence.findMany({
              where: { orgId: ctx.fleetopsUser.orgId, workOrderId: order.id },
              orderBy: { createdAt: "desc" },
            }),
            fleetDb.auditEvent.findMany({
              where: {
                orgId: ctx.fleetopsUser.orgId,
                entityType: "WORK_ORDER",
                entityId: order.id,
              },
              orderBy: { createdAt: "desc" },
              take: 100,
            }),
          ]);
          hydratedOrder = hydratedRows[0];
          vehicleComponents = components;
          evidence = evid;
          activity = act;
        } catch (error) {
          console.error(
            "[WO_DETAIL_ERROR] Failed to load work order detail:",
            error
          );
          hydratedOrder = order;
        }

        return {
          order: {
            ...hydratedOrder,
            vehicle: hydratedOrder?.vehicle
              ? { ...hydratedOrder.vehicle, components: vehicleComponents }
              : null,
            evidence,
          },
          activity,
        };
      }),
    handoffTimeline: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, [
        "SUPERADMIN",
        "FLEET_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
        "ACCOUNTANT",
      ]);
      const where = ["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
        ? {
            orgId: ctx.fleetopsUser.orgId,
            assignedMechanicId: ctx.fleetopsUser.id,
          }
        : { orgId: ctx.fleetopsUser.orgId };
      const orderRows = await fleetDb.workOrder.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 100,
      });

      // FIX: Add error handling for Promise.all() in handoff timeline
      let orders: any[] = [];
      let events: any[] = [];

      try {
        const [hydOrd, evt] = await Promise.all([
          hydrateWorkOrders(orderRows as any[], ctx.fleetopsUser.orgId),
          fleetDb.auditEvent.findMany({
            where: { orgId: ctx.fleetopsUser.orgId, entityType: "WORK_ORDER" },
            orderBy: { createdAt: "desc" },
            take: 500,
          }),
        ]);
        orders = hydOrd;
        events = evt;
      } catch (error) {
        console.error(
          "[HANDOFF_ERROR] Failed to load handoff timeline:",
          error
        );
        orders = orderRows;
      }

      const eventsByOrder = new Map<string, any[]>();
      for (const event of events as any[]) {
        const list = eventsByOrder.get(event.entityId) ?? [];
        if (list.length < 20) list.push(event);
        eventsByOrder.set(event.entityId, list);
      }
      return orders.map((order: any) => ({
        workOrderId: order.id,
        title: order.title,
        vehicle: order.vehicle
          ? vehicleIdentity(order.vehicle)
          : order.vehicleId,
        status: order.status,
        priority: order.priority,
        assignedMechanic: order.assignedMechanic?.fullName ?? "Unassigned",
        updatedAt: order.updatedAt,
        activity: eventsByOrder.get(order.id) ?? [],
      }));
    }),
    board: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, [
        "SUPERADMIN",
        "FLEET_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
      ]);
      const where = ["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
        ? {
            orgId: ctx.fleetopsUser.orgId,
            assignedMechanicId: ctx.fleetopsUser.id,
          }
        : { orgId: ctx.fleetopsUser.orgId };
      const orderRows = await fleetDb.workOrder.findMany({
        where,
        orderBy: { updatedAt: "desc" },
      });
      const orders = await hydrateWorkOrders(
        orderRows as any[],
        ctx.fleetopsUser.orgId
      );
      return {
        columns: [
          "OPEN",
          "IN_PROGRESS",
          "WAITING_FOR_PARTS",
          "READY_FOR_REVIEW",
          "REWORK",
          "COMPLETED",
          "CANCELLED",
        ].map(status => ({
          status,
          items: orders.filter((order: any) => order.status === status),
        })),
        totals: {
          all: orders.length,
          open: orders.filter((order: any) => order.status === "OPEN").length,
          inProgress: orders.filter(
            (order: any) => order.status === "IN_PROGRESS"
          ).length,
          completed: orders.filter((order: any) => order.status === "COMPLETED")
            .length,
        },
      };
    }),
    updateStatus: fleetOpsProcedure
      .input(
        z.object({
          workOrderId: z.string().uuid(),
          status: z.enum([
            "OPEN",
            "IN_PROGRESS",
            "WAITING_FOR_PARTS",
            "READY_FOR_REVIEW",
            "REWORK",
            "CANCELLED",
          ]),
          expectedUpdatedAt: z.coerce.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "FLEET_MANAGER",
          "MECHANIC",
          "TECHNICIAN",
        ]);
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.workOrder.findFirst({
          where: {
            id: input.workOrderId,
            orgId: ctx.fleetopsUser.orgId,
            ...(["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
              ? { assignedMechanicId: ctx.fleetopsUser.id }
              : {}),
          },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Work order not found in your organization scope.",
          });
        if (
          input.expectedUpdatedAt &&
          new Date(order.updatedAt).getTime() !==
            input.expectedUpdatedAt.getTime()
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This work order changed elsewhere. Refresh the queue before updating its status.",
          });
        const allowed: Record<string, string[]> = {
          OPEN: ["IN_PROGRESS", "CANCELLED"],
          IN_PROGRESS: [
            "WAITING_FOR_PARTS",
            "READY_FOR_REVIEW",
            "REWORK",
            "CANCELLED",
          ],
          WAITING_FOR_PARTS: ["IN_PROGRESS", "CANCELLED"],
          READY_FOR_REVIEW: ["COMPLETED", "REWORK"],
          REWORK: ["IN_PROGRESS", "READY_FOR_REVIEW", "CANCELLED"],
          COMPLETED: [],
          CANCELLED: [],
        };
        const roleAllowed =
          ctx.fleetopsUser.role === "FLEET_MANAGER"
            ? ["CANCELLED", "REWORK"]
            : [
                "IN_PROGRESS",
                "WAITING_FOR_PARTS",
                "READY_FOR_REVIEW",
                "CANCELLED",
              ];
        if (
          !allowed[order.status]?.includes(input.status) ||
          !roleAllowed.includes(input.status)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Cannot move work order from ${order.status} to ${input.status}; your role is not permitted to perform this transition.`,
          });
        if (input.status === "READY_FOR_REVIEW") {
          const checklistEvents = await fleetDb.auditEvent.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              entityType: "WORK_ORDER",
              entityId: order.id,
              action: "WORK_ORDER_CHECKLIST_UPDATED",
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          });
          let items: any[] = [];
          try {
            items =
              JSON.parse((checklistEvents[0] as any)?.metadata ?? "{}").items ??
              [];
          } catch {
            items = [];
          }
          if (!items.length || items.some(item => !item.completed))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Complete and save every execution checklist item before review.",
            });
        }
        const updated = await fleetDb.workOrder.update({
          where: { id: order.id },
          data: {
            status: input.status,
            ...(input.status === "IN_PROGRESS" && !order.startedAt
              ? { startedAt: new Date() }
              : {}),
          },
        });
        await recordAudit(ctx, {
          action: "WORK_ORDER_STATUS_CHANGED",
          entityType: "WORK_ORDER",
          entityId: order.id,
          summary: `Work order moved from ${order.status} to ${input.status}`,
          metadata: { previousStatus: order.status, nextStatus: input.status },
        });
        return updated;
      }),
    bulkUpdate: fleetOpsProcedure
      .input(
        z.object({
          workOrderIds: z.array(z.string().uuid()).min(1).max(100),
          priority: z.nativeEnum(Priority).optional(),
          assignedMechanicId: z.string().uuid().nullable().optional(),
          scheduledFor: z.coerce.date().nullable().optional(),
          archive: z.boolean().optional(),
          cancel: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        if (
          !input.priority &&
          input.assignedMechanicId === undefined &&
          input.scheduledFor === undefined &&
          input.archive === undefined &&
          !input.cancel
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Choose a priority, assignee, schedule, archive, or cancellation action.",
          });
        if (input.assignedMechanicId) {
          const assignee = await fleetDb.user.findFirst({
            where: {
              id: input.assignedMechanicId,
              orgId: ctx.fleetopsUser.orgId,
              role: { in: ["MECHANIC", "TECHNICIAN"] },
            },
          });
          if (!assignee)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Assignee must belong to this organization.",
            });
        }
        const orders = await fleetDb.workOrder.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            id: { in: input.workOrderIds },
          },
        });
        if (orders.length !== input.workOrderIds.length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "One or more work orders are outside this organization.",
          });
        const { results, skipped } = await fleetDb.$transaction(
          async (tx: any) => {
            const results = [];
            let skipped = 0;
            for (const order of orders as any[]) {
              if (
                input.cancel &&
                ["COMPLETED", "CANCELLED"].includes(order.status)
              ) {
                skipped += 1;
                continue;
              }
              const updated = await tx.workOrder.update({
                where: { id: order.id },
                data: {
                  ...(input.priority ? { priority: input.priority } : {}),
                  ...(input.assignedMechanicId !== undefined
                    ? { assignedMechanicId: input.assignedMechanicId }
                    : {}),
                  ...(input.scheduledFor !== undefined
                    ? { scheduledFor: input.scheduledFor }
                    : {}),
                  ...(input.archive !== undefined
                    ? { archivedAt: input.archive ? new Date() : null }
                    : {}),
                  ...(input.cancel ? { status: "CANCELLED" } : {}),
                },
              });
              results.push(updated);
            }
            return { results, skipped };
          }
        );
        for (const order of results as any[]) {
          await recordAudit(ctx, {
            action: "WORK_ORDER_BULK_UPDATED",
            entityType: "WORK_ORDER",
            entityId: order.id,
            summary: `Bulk work-order update applied to ${order.title}`,
            metadata: {
              priority: input.priority,
              assignedMechanicId: input.assignedMechanicId,
              cancelled: Boolean(input.cancel),
              scheduledFor: input.scheduledFor,
              archived: input.archive,
            },
          });
        }
        return {
          updated: results.length,
          skipped,
          workOrders: results,
        };
      }),
    assign: fleetOpsProcedure
      .input(
        z.object({
          workOrderId: z.string().uuid(),
          assignedMechanicId: z.string().uuid().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.workOrder.findFirst({
          where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Work order not found in this organization.",
          });
        let assignee = null;
        if (input.assignedMechanicId) {
          assignee = await fleetDb.user.findFirst({
            where: {
              id: input.assignedMechanicId,
              orgId: ctx.fleetopsUser.orgId,
              role: { in: ["MECHANIC", "TECHNICIAN"] },
            },
          });
          if (!assignee)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Owner must be a mechanic or technician in this organization.",
            });
        }
        const updated = await fleetDb.workOrder.update({
          where: { id: order.id },
          data: { assignedMechanicId: input.assignedMechanicId },
        });
        await recordAudit(ctx, {
          action: "WORK_ORDER_ASSIGNED",
          entityType: "WORK_ORDER",
          entityId: order.id,
          summary: `${order.title} assigned to ${assignee?.fullName ?? "unassigned"}`,
          metadata: {
            previousAssignedMechanicId: order.assignedMechanicId,
            assignedMechanicId: input.assignedMechanicId,
          },
        });
        return updated;
      }),
    startWork: fleetOpsProcedure
      .input(z.object({ workOrderId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["MECHANIC", "TECHNICIAN"]);
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.workOrder.findFirst({
          where: {
            id: input.workOrderId,
            orgId: ctx.fleetopsUser.orgId,
            assignedMechanicId: ctx.fleetopsUser.id,
          },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Work order is not assigned to you.",
          });
        if (["COMPLETED", "CANCELLED"].includes(order.status))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Closed work orders cannot be started.",
          });
        const started = await fleetDb.workOrder.update({
          where: { id: order.id },
          data: {
            status: "IN_PROGRESS",
            startedAt: order.startedAt ?? new Date(),
          },
        });
        await recordAudit(ctx, {
          action: "WORK_ORDER_STARTED",
          entityType: "WORK_ORDER",
          entityId: order.id,
          summary: `Work started on ${order.title}`,
          metadata: { previousStatus: order.status },
        });
        const managers = await fleetDb.user.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            role: { in: ["FLEET_MANAGER", "SUPERADMIN"] },
          },
        });
        if (managers.length && fleetDb.notification?.createMany)
          await fleetDb.notification.createMany({
            data: managers.map((manager: any) => ({
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              recipientId: manager.id,
              title: "Work order started",
              message: `${order.title} is now in progress by ${ctx.fleetopsUser.fullName}.`,
              type: "WORK_ORDER_STARTED",
              severity: "INFO",
              sourceType: "WORK_ORDER",
              dedupeKey: `WORK_ORDER_STARTED:${order.id}:${ctx.fleetopsUser.id}`,
              referenceId: order.id,
              isRead: false,
              createdAt: new Date(),
            })),
          });
        return started;
      }),
    reservePart: fleetOpsProcedure
      .input(
        z.object({
          workOrderId: z.string().uuid(),
          partId: z.string().uuid(),
          quantity: z.number().int().positive(),
          reason: z
            .string()
            .trim()
            .min(3)
            .max(300)
            .default("Reserved for work order"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "FLEET_MANAGER",
          "INVENTORY_MANAGER",
          "MECHANIC",
          "TECHNICIAN",
        ]);
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.workOrder.findFirst({
          where: {
            id: input.workOrderId,
            orgId: ctx.fleetopsUser.orgId,
            ...(["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
              ? { assignedMechanicId: ctx.fleetopsUser.id }
              : {}),
          },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Work order not found in your organization scope.",
          });
        const part = await fleetDb.inventoryPart.findFirst({
          where: { id: input.partId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!part)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory part not found.",
          });
        const [reservations, releases] = await Promise.all([
          fleetDb.auditEvent.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              action: "INVENTORY_PART_RESERVED",
            },
          }),
          fleetDb.auditEvent.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              action: "INVENTORY_PART_RETURNED",
            },
          }),
        ]);
        const activeReserved = (reservations as any[])
          .filter(event => {
            try {
              const metadata = JSON.parse(event.metadata ?? "{}");
              return (
                metadata.workOrderId === order.id &&
                metadata.partId === part.id &&
                !(releases as any[]).some(release => {
                  try {
                    const released = JSON.parse(release.metadata ?? "{}");
                    return released.reservationId === metadata.reservationId;
                  } catch {
                    return false;
                  }
                })
              );
            } catch {
              return false;
            }
          })
          .reduce((sum, event) => {
            try {
              return (
                sum + Number(JSON.parse(event.metadata ?? "{}").quantity ?? 0)
              );
            } catch {
              return sum;
            }
          }, 0);
        if (Number(part.quantityOnHand) - activeReserved < input.quantity)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Insufficient available stock after existing reservations.",
          });
        const reservationId = crypto.randomUUID();
        if (fleetDb.inventoryMovement?.create)
          await fleetDb.inventoryMovement.create({
            data: {
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              partId: part.id,
              workOrderId: order.id,
              actorId: ctx.fleetopsUser.id,
              movementType: "RESERVATION",
              quantity: input.quantity,
              unitCost: part.unitCost,
              reason: input.reason,
              createdAt: new Date(),
            },
          });
        await recordAudit(ctx, {
          action: "INVENTORY_PART_RESERVED",
          entityType: "WORK_ORDER_PART",
          entityId: order.id,
          summary: `Reserved ${input.quantity} ${part.name} for work order`,
          metadata: {
            reservationId,
            workOrderId: order.id,
            partId: part.id,
            quantity: input.quantity,
            reason: input.reason,
          },
        });
        return {
          reservationId,
          workOrderId: order.id,
          partId: part.id,
          quantity: input.quantity,
        };
      }),
    returnReservedPart: fleetOpsProcedure
      .input(
        z.object({
          reservationId: z.string().uuid(),
          quantity: z.number().int().positive(),
          reason: z
            .string()
            .trim()
            .min(3)
            .max(300)
            .default("Returned unused reserved stock"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "FLEET_MANAGER",
          "INVENTORY_MANAGER",
          "MECHANIC",
          "TECHNICIAN",
        ]);
        assertWritable(ctx.fleetopsUser.org);
        const reservations = await fleetDb.auditEvent.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            action: "INVENTORY_PART_RESERVED",
          },
        });
        const releases = await fleetDb.auditEvent.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            action: "INVENTORY_PART_RETURNED",
          },
        });
        const reservation = (reservations as any[]).find(event => {
          try {
            return (
              JSON.parse(event.metadata ?? "{}").reservationId ===
              input.reservationId
            );
          } catch {
            return false;
          }
        });
        if (!reservation)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Active part reservation not found.",
          });
        const metadata = JSON.parse((reservation as any).metadata ?? "{}");
        const returnedQuantity = (releases as any[])
          .filter(event => {
            try {
              return (
                JSON.parse(event.metadata ?? "{}").reservationId ===
                input.reservationId
              );
            } catch {
              return false;
            }
          })
          .reduce((sum, event) => {
            try {
              return (
                sum + Number(JSON.parse(event.metadata ?? "{}").quantity ?? 0)
              );
            } catch {
              return sum;
            }
          }, 0);
        if (returnedQuantity >= Number(metadata.quantity))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This part reservation has already been returned.",
          });
        if (input.quantity > Number(metadata.quantity) - returnedQuantity)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Return quantity cannot exceed the remaining reserved quantity.",
          });
        const part = await fleetDb.inventoryPart.findFirst({
          where: { id: metadata.partId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!part)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Reserved part is no longer in this organization.",
          });
        const order = await fleetDb.workOrder.findFirst({
          where: {
            id: metadata.workOrderId,
            orgId: ctx.fleetopsUser.orgId,
            ...(["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
              ? { assignedMechanicId: ctx.fleetopsUser.id }
              : {}),
          },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Work order is outside your role scope.",
          });
        if (fleetDb.inventoryMovement?.create)
          await fleetDb.inventoryMovement.create({
            data: {
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              partId: part.id,
              workOrderId: order.id,
              actorId: ctx.fleetopsUser.id,
              movementType: "RETURN",
              quantity: input.quantity,
              unitCost: part.unitCost,
              reason: input.reason,
              createdAt: new Date(),
            },
          });
        await recordAudit(ctx, {
          action: "INVENTORY_PART_RETURNED",
          entityType: "WORK_ORDER_PART",
          entityId: order.id,
          summary: `Returned ${input.quantity} ${part.name} from work order reservation`,
          metadata: {
            reservationId: input.reservationId,
            workOrderId: order.id,
            partId: part.id,
            quantity: input.quantity,
            reason: input.reason,
          },
        });
        return {
          reservationId: input.reservationId,
          workOrderId: order.id,
          partId: part.id,
          quantity: input.quantity,
        };
      }),
    create: fleetOpsProcedure
      .input(
        z.object({
          vehicleId: z.string().uuid(),
          title: z.string().min(3),
          description: z.string().optional(),
          priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
          assignedMechanicId: z.string().uuid().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "SUPERADMIN",
          "FLEET_MANAGER",
          "MECHANIC",
          "TECHNICIAN",
        ]);
        assertWritable(ctx.fleetopsUser.org);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found.",
          });
        if (input.assignedMechanicId) {
          const assignee = await fleetDb.user.findFirst({
            where: {
              id: input.assignedMechanicId,
              orgId: ctx.fleetopsUser.orgId,
              role: { in: ["MECHANIC", "TECHNICIAN"] },
            },
          });
          if (!assignee)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Mechanic or Technician must belong to this organization.",
            });
        }
        const created = await fleetDb.workOrder.create({
          data: {
            id: crypto.randomUUID(),
            ...input,
            status: "OPEN",
            orgId: ctx.fleetopsUser.orgId,
            createdAt: new Date(),
          },
        });
        await recordAudit(ctx, {
          action: "WORK_ORDER_CREATED",
          entityType: "WORK_ORDER",
          entityId: created.id,
          summary: `Work order created: ${created.title}`,
          metadata: {
            priority: created.priority,
            assignedMechanicId: created.assignedMechanicId,
          },
        });
        return created;
      }),
    update: fleetOpsProcedure
      .input(
        z
          .object({
            workOrderId: z.string().uuid(),
            title: z.string().trim().min(3).max(160).optional(),
            description: z.string().trim().max(2000).nullable().optional(),
            priority: z.nativeEnum(Priority).optional(),
            assignedMechanicId: z.string().uuid().nullable().optional(),
          })
          .refine(
            input =>
              input.title !== undefined ||
              input.description !== undefined ||
              input.priority !== undefined ||
              input.assignedMechanicId !== undefined,
            { message: "Provide at least one work-order field to update." }
          )
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.workOrder.findFirst({
          where: { id: input.workOrderId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Work order not found in this organization.",
          });
        if (input.assignedMechanicId) {
          const assignee = await fleetDb.user.findFirst({
            where: {
              id: input.assignedMechanicId,
              orgId: ctx.fleetopsUser.orgId,
              role: { in: ["MECHANIC", "TECHNICIAN"] },
            },
          });
          if (!assignee)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Mechanic or Technician must belong to this organization.",
            });
        }
        const updated = await fleetDb.workOrder.update({
          where: { id: order.id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.priority !== undefined
              ? { priority: input.priority }
              : {}),
            ...(input.assignedMechanicId !== undefined
              ? { assignedMechanicId: input.assignedMechanicId }
              : {}),
          },
        });
        await recordAudit(ctx, {
          action: "WORK_ORDER_UPDATED",
          entityType: "WORK_ORDER",
          entityId: updated.id,
          summary: `Updated work order: ${updated.title}`,
          metadata: {
            title: input.title,
            descriptionChanged: input.description !== undefined,
            priority: input.priority,
            assignedMechanicId: input.assignedMechanicId ?? null,
          },
        });
        return updated;
      }),
    complete: fleetOpsProcedure
      .input(
        z.object({
          workOrderId: z.string().uuid(),
          expectedUpdatedAt: z.coerce.date().optional(),
          parts: z
            .array(
              z.object({
                partId: z.string().uuid(),
                qtyUsed: z.number().int().positive(),
              })
            )
            .default([]),
          laborHours: z.number().nonnegative().max(1000).default(0),
          repairNotes: z
            .string()
            .trim()
            .min(3)
            .max(5000)
            .default("Completed from organization oversight."),
          evidence: z
            .array(
              z.object({
                fileData: z.string().max(6_000_000),
                contentType: z.string().startsWith("image/"),
                fileName: z.string().min(1).max(200),
                caption: z.string().max(500).optional(),
              })
            )
            .max(8)
            .default([]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["MECHANIC", "TECHNICIAN"]);
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.workOrder.findFirst({
          where: {
            id: input.workOrderId,
            orgId: ctx.fleetopsUser.orgId,
            ...(["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
              ? { assignedMechanicId: ctx.fleetopsUser.id }
              : {}),
          },
          include: { vehicle: true },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Work order not found.",
          });
        if (
          input.expectedUpdatedAt &&
          new Date(order.updatedAt).getTime() !==
            input.expectedUpdatedAt.getTime()
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This work order changed elsewhere. Refresh before submitting completion.",
          });
        if (!["IN_PROGRESS", "REWORK"].includes(order.status))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Start work and move the order into execution before submitting completion.",
          });
        const checklistEvents = await fleetDb.auditEvent.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            entityType: "WORK_ORDER",
            entityId: order.id,
            action: "WORK_ORDER_CHECKLIST_UPDATED",
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        });
        let checklistItems: any[] = [];
        try {
          checklistItems =
            JSON.parse((checklistEvents[0] as any)?.metadata ?? "{}").items ??
            [];
        } catch {
          checklistItems = [];
        }
        if (
          !checklistItems.length ||
          checklistItems.some(item => !item.completed)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Complete and save every execution checklist item before submitting completion.",
          });
        const uploadedEvidence = await Promise.all(
          input.evidence.map(async (item, index) => {
            const raw = item.fileData.replace(/^data:[^;]+;base64,/, "");
            return {
              ...item,
              uploaded: await storagePut(
                `fleetops/work-orders/${ctx.fleetopsUser.orgId}/${order.id}/${Date.now()}-${index}-${item.fileName}`,
                Buffer.from(raw, "base64"),
                item.contentType
              ),
            };
          })
        );
        const result = await fleetDb.$transaction(async (tx: any) => {
          let partsCost = 0;
          for (const requested of input.parts) {
            const part = await tx.inventoryPart.findFirst({
              where: { id: requested.partId, orgId: ctx.fleetopsUser.orgId },
            });
            if (!part || part.quantityOnHand < requested.qtyUsed)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Insufficient inventory for one or more parts.",
              });
            partsCost += Number(part.unitCost) * requested.qtyUsed;
            await tx.inventoryPart.update({
              where: { id: part.id },
              data: { quantityOnHand: { decrement: requested.qtyUsed } },
            });
            await tx.workOrderPart.create({
              data: {
                id: crypto.randomUUID(),
                workOrderId: order.id,
                partId: part.id,
                qtyUsed: requested.qtyUsed,
                unitPrice: part.unitCost,
              },
            });
            if (tx.inventoryMovement?.create)
              await tx.inventoryMovement.create({
                data: {
                  id: crypto.randomUUID(),
                  orgId: ctx.fleetopsUser.orgId,
                  partId: part.id,
                  workOrderId: order.id,
                  actorId: ctx.fleetopsUser.id,
                  movementType: "ISSUE",
                  quantity: -requested.qtyUsed,
                  unitCost: part.unitCost,
                  reason: `Consumed for work order ${order.id}`,
                  createdAt: new Date(),
                },
              });
          }
          const completed = await tx.workOrder.update({
            where: { id: order.id },
            data: {
              status: "READY_FOR_REVIEW",
              startedAt: order.startedAt ?? new Date(),
              completedAt: null,
              laborHours: input.laborHours,
              repairNotes: input.repairNotes,
            },
          });
          for (const item of uploadedEvidence)
            await tx.workOrderEvidence.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                workOrderId: order.id,
                uploadedById: ctx.fleetopsUser.id,
                fileUrl: item.uploaded.url,
                ...(item.uploaded.key ? { fileKey: item.uploaded.key } : {}),
                ...(item.caption ? { caption: item.caption } : {}),
                createdAt: new Date(),
              },
            });
          const approvers = await tx.user.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              role: { in: ["SUPERADMIN", "FLEET_MANAGER"] },
            },
          });
          if (approvers.length)
            await tx.notification.createMany({
              data: approvers.map((approver: any) => ({
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                recipientId: approver.id,
                title: "Work order ready for review",
                message: `${order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId} repair is ready for approval. Parts cost: ₹${partsCost.toLocaleString("en-IN")}.`,
                type: "WORK_ORDER_REVIEW",
                severity: "HIGH",
                sourceType: "WORK_ORDER",
                dedupeKey: `WORK_ORDER_REVIEW:${order.id}:${approver.id}`,
                referenceId: order.id,
                isRead: false,
                createdAt: new Date(),
              })),
            });
          return { completed, partsCost };
        });
        await recordAudit(ctx, {
          action: "WORK_ORDER_READY_FOR_REVIEW",
          entityType: "WORK_ORDER",
          entityId: order.id,
          summary: `Work order ready for review for ${order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId}`,
          metadata: {
            partsCost: result.partsCost,
            laborHours: input.laborHours,
            evidenceCount: input.evidence.length,
          },
        });
        await evaluateLowInventory(ctx.fleetopsUser.orgId);
        return result;
      }),
    updateChecklist: fleetOpsProcedure
      .input(
        z.object({
          workOrderId: z.string().uuid(),
          items: z
            .array(
              z.object({
                id: z.string().min(1).max(80),
                title: z.string().trim().min(2).max(160),
                completed: z.boolean(),
              })
            )
            .min(1)
            .max(30),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["MECHANIC", "TECHNICIAN"]);
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.workOrder.findFirst({
          where: {
            id: input.workOrderId,
            orgId: ctx.fleetopsUser.orgId,
            assignedMechanicId: ctx.fleetopsUser.id,
          },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Work order is not assigned to you.",
          });
        await recordAudit(ctx, {
          action: "WORK_ORDER_CHECKLIST_UPDATED",
          entityType: "WORK_ORDER",
          entityId: order.id,
          summary: `Checklist updated for ${order.title}`,
          metadata: { items: input.items },
        });
        return { workOrderId: order.id, items: input.items };
      }),
    approve: fleetOpsProcedure
      .input(z.object({ workOrderId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.workOrder.findFirst({
          where: {
            id: input.workOrderId,
            orgId: ctx.fleetopsUser.orgId,
            status: "READY_FOR_REVIEW",
          },
          include: { vehicle: true, partsUsed: true },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Only work orders ready for review can be approved.",
          });
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: order.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "The work order vehicle is not available in this organization.",
          });
        const latestOdometer = await fleetDb.odometerLog.findFirst({
          where: { vehicleId: order.vehicleId },
          orderBy: { createdAt: "desc" },
        });
        const serviceOdometer =
          latestOdometer?.reading ?? vehicle.currentOdometer;
        const checklistEvents = await fleetDb.auditEvent.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            entityType: "WORK_ORDER",
            entityId: order.id,
            action: "WORK_ORDER_CHECKLIST_UPDATED",
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        });
        let items: any[] = [];
        try {
          items =
            JSON.parse((checklistEvents[0] as any)?.metadata ?? "{}").items ??
            [];
        } catch {
          items = [];
        }
        if (!items.length || items.some(item => !item.completed))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Complete every execution checklist item before approval.",
          });
        const recordedParts = await fleetDb.workOrderPart.findMany({
          where: { workOrderId: order.id },
        });
        const partsCost = (recordedParts as any[]).reduce(
          (sum: number, part: any) =>
            sum + Number(part.unitPrice ?? 0) * Number(part.qtyUsed ?? 0),
          0
        );
        const reservations = await fleetDb.auditEvent.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            action: "INVENTORY_PART_RESERVED",
          },
        });
        const returns = await fleetDb.auditEvent.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            action: "INVENTORY_PART_RETURNED",
          },
        });
        const activeReservations = (reservations as any[])
          .map(event => {
            try {
              return JSON.parse(event.metadata ?? "{}");
            } catch {
              return null;
            }
          })
          .filter((metadata: any) => metadata?.workOrderId === order.id)
          .filter((metadata: any) => {
            const returned = (returns as any[]).reduce((sum, event) => {
              try {
                const data = JSON.parse(event.metadata ?? "{}");
                return data.reservationId === metadata.reservationId
                  ? sum + Number(data.quantity ?? 0)
                  : sum;
              } catch {
                return sum;
              }
            }, 0);
            return returned < Number(metadata.quantity ?? 0);
          });
        const reservedPartRows = activeReservations.length
          ? await fleetDb.inventoryPart.findMany({
              where: {
                orgId: ctx.fleetopsUser.orgId,
                id: {
                  in: activeReservations.map(
                    (metadata: any) => metadata.partId
                  ),
                },
              },
            })
          : [];
        const reservedPartsCost = activeReservations.reduce(
          (sum: number, metadata: any) => {
            const part = (reservedPartRows as any[]).find(
              row => row.id === metadata.partId
            );
            const returned = (returns as any[]).reduce((total, event) => {
              try {
                const data = JSON.parse(event.metadata ?? "{}");
                return data.reservationId === metadata.reservationId
                  ? total + Number(data.quantity ?? 0)
                  : total;
              } catch {
                return total;
              }
            }, 0);
            return (
              sum +
              Math.max(0, Number(metadata.quantity ?? 0) - returned) *
                Number(part?.unitCost ?? 0)
            );
          },
          0
        );
        const settings = await fleetDb.organizationSetting.findFirst({
          where: { orgId: ctx.fleetopsUser.orgId },
        });
        const laborRatePerHour = Number(
          (settings as any)?.laborRatePerHour ?? 0
        );
        const laborCost =
          laborRatePerHour > 0 && Number(order.laborHours ?? 0) > 0
            ? laborRatePerHour * Number(order.laborHours)
            : 0;
        const approved = await fleetDb.$transaction(async (tx: any) => {
          const completed = await tx.workOrder.update({
            where: { id: order.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
          for (const metadata of activeReservations) {
            const returned = (returns as any[]).reduce((sum, event) => {
              try {
                const data = JSON.parse(event.metadata ?? "{}");
                return data.reservationId === metadata.reservationId
                  ? sum + Number(data.quantity ?? 0)
                  : sum;
              } catch {
                return sum;
              }
            }, 0);
            const quantityToConsume = Number(metadata.quantity ?? 0) - returned;
            const part = (reservedPartRows as any[]).find(
              row => row.id === metadata.partId
            );
            if (!part || quantityToConsume <= 0) continue;
            const changed = await tx.inventoryPart.updateMany({
              where: {
                id: part.id,
                orgId: ctx.fleetopsUser.orgId,
                quantityOnHand: { gte: quantityToConsume },
              },
              data: { quantityOnHand: { decrement: quantityToConsume } },
            });
            if (!changed.count)
              throw new TRPCError({
                code: "CONFLICT",
                message: `Insufficient stock to consume reserved part ${part.name}.`,
              });
            await tx.workOrderPart.create({
              data: {
                id: crypto.randomUUID(),
                workOrderId: order.id,
                partId: part.id,
                qtyUsed: quantityToConsume,
                unitPrice: part.unitCost,
              },
            });
            if (tx.inventoryMovement?.create)
              await tx.inventoryMovement.create({
                data: {
                  id: crypto.randomUUID(),
                  orgId: ctx.fleetopsUser.orgId,
                  partId: part.id,
                  workOrderId: order.id,
                  actorId: ctx.fleetopsUser.id,
                  movementType: "ISSUE",
                  quantity: -quantityToConsume,
                  unitCost: part.unitCost,
                  reason: `Consumed for approved work order ${order.id}`,
                  createdAt: new Date(),
                },
              });
          }
          const components = await tx.component.findMany({
            where: { vehicleId: order.vehicleId },
          });
          const matching = components.filter((component: any) =>
            order.title
              .toLowerCase()
              .includes(String(component.name).toLowerCase())
          );
          for (const component of matching)
            await tx.component.update({
              where: { id: component.id },
              data: { lastServicedOdometer: serviceOdometer },
            });
          if (matching.length && vehicle.status === "MAINTENANCE")
            await tx.vehicle.update({
              where: { id: order.vehicleId },
              data: { status: "ACTIVE" },
            });
          if (partsCost + reservedPartsCost > 0 && tx.financialRecord?.create)
            await tx.financialRecord.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                vehicleId: order.vehicleId,
                type: "EXPENSE",
                category: "MAINTENANCE_PARTS",
                amount: partsCost + reservedPartsCost,
                transactionDate: new Date(),
                costCenterType: "WORK_ORDER",
                costCenterId: order.id,
                vendor: "Inventory",
                approvalStatus: "APPROVED",
                approvedById: ctx.fleetopsUser.id,
                approvalReason: `Approved parts used for ${order.title}`,
                createdAt: new Date(),
              },
            });
          if (laborCost > 0 && tx.financialRecord?.create)
            await tx.financialRecord.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                vehicleId: order.vehicleId,
                type: "EXPENSE",
                category: "MAINTENANCE_LABOR",
                amount: laborCost,
                transactionDate: new Date(),
                costCenterType: "WORK_ORDER",
                costCenterId: order.id,
                vendor: "Internal labor",
                approvalStatus: "APPROVED",
                approvedById: ctx.fleetopsUser.id,
                approvalReason: `Labor cost for ${order.title} at ₹${laborRatePerHour.toLocaleString("en-IN")}/hour`,
                createdAt: new Date(),
              },
            });
          return {
            completed,
            servicedComponents: matching.length,
            partsCost: partsCost + reservedPartsCost,
            laborCost,
          };
        });
        await recordAudit(ctx, {
          action: "WORK_ORDER_APPROVED",
          entityType: "WORK_ORDER",
          entityId: order.id,
          summary: `Work order approved and completed: ${order.title}`,
          metadata: {
            checklistItems: items.length,
            servicedComponents: approved.servicedComponents,
            partsCost: approved.partsCost,
            laborCost: approved.laborCost,
            laborRatePerHour,
            reservedPartsConsumed: activeReservations.length,
          },
        });
        return approved.completed;
      }),
  }),
  inventory: router({
    get: fleetOpsProcedure
      .input(z.object({ partId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        const part = await fleetDb.inventoryPart.findFirst({
          where: { id: input.partId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!part)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory part not found.",
          });
        const movements = await fleetDb.inventoryMovement.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, partId: part.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        });
        const reserved = (movements as any[])
          .filter(
            movement =>
              movement.movementType === "RESERVATION" &&
              Number(movement.quantity) > 0
          )
          .reduce((sum, movement) => sum + Number(movement.quantity), 0);
        const released = (movements as any[])
          .filter(
            movement =>
              movement.movementType === "RELEASE" ||
              movement.movementType === "ISSUE"
          )
          .reduce(
            (sum, movement) => sum + Math.abs(Number(movement.quantity)),
            0
          );
        return {
          part,
          movements,
          reserved: Math.max(0, reserved - released),
          available: Math.max(
            0,
            Number(part.quantityOnHand) - Math.max(0, reserved - released)
          ),
        };
      }),
    list: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      return fleetDb.inventoryPart.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        orderBy: { name: "asc" },
      });
    }),
    references: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, [
        "SUPERADMIN",
        "INVENTORY_MANAGER",
        "FLEET_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
      ]);
      return fleetDb.inventoryPart.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        select: { id: true, sku: true, name: true },
        orderBy: { name: "asc" },
      });
    }),
    movements: fleetOpsProcedure
      .input(
        z
          .object({
            partId: z.string().uuid().optional(),
            workOrderId: z.string().uuid().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "SUPERADMIN",
          "INVENTORY_MANAGER",
          "MECHANIC",
          "TECHNICIAN",
        ]);
        const filters = {
          ...(input?.partId ? { partId: input.partId } : {}),
          ...(input?.workOrderId ? { workOrderId: input.workOrderId } : {}),
        };
        if (
          ctx.fleetopsUser.role === "SUPERADMIN" ||
          ctx.fleetopsUser.role === "INVENTORY_MANAGER"
        )
          return fleetDb.inventoryMovement.findMany({
            where: { orgId: ctx.fleetopsUser.orgId, ...filters },
            orderBy: { createdAt: "desc" },
            take: 100,
          });
        const assignedOrders = await fleetDb.workOrder.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            assignedMechanicId: ctx.fleetopsUser.id,
          },
          select: { id: true },
        });
        return fleetDb.inventoryMovement.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            workOrderId: { in: assignedOrders.map((order: any) => order.id) },
            ...(input?.partId ? { partId: input.partId } : {}),
            ...(input?.workOrderId ? { workOrderId: input.workOrderId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        });
      }),
    create: fleetOpsProcedure
      .input(
        z.object({
          sku: z.string().min(1),
          name: z.string().min(2),
          binLocation: z.string().optional(),
          quantityOnHand: z.number().int().nonnegative(),
          minReorderLevel: z.number().int().nonnegative().default(5),
          unitCost: z.number().nonnegative(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const part = await fleetDb.inventoryPart.create({
          data: {
            id: crypto.randomUUID(),
            ...input,
            orgId: ctx.fleetopsUser.orgId,
          },
        });
        if (input.quantityOnHand > 0 && fleetDb.inventoryMovement?.create)
          await fleetDb.inventoryMovement.create({
            data: {
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              partId: part.id,
              actorId: ctx.fleetopsUser.id,
              movementType: "RECEIPT",
              quantity: input.quantityOnHand,
              unitCost: input.unitCost,
              reason: "Opening inventory balance",
              createdAt: new Date(),
            },
          });
        await recordAudit(ctx, {
          action: "INVENTORY_PART_CREATED",
          entityType: "INVENTORY_PART",
          entityId: part.id,
          summary: `Inventory part created: ${part.name}`,
          metadata: { openingQuantity: input.quantityOnHand },
        });
        await evaluateLowInventory(ctx.fleetopsUser.orgId);
        return part;
      }),
    receive: fleetOpsProcedure
      .input(
        z.object({
          partId: z.string().uuid(),
          quantity: z.number().int().positive(),
          unitCost: z.number().nonnegative().optional(),
          reason: z.string().min(3).max(300),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const part = await fleetDb.inventoryPart.findFirst({
          where: { id: input.partId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!part)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory part not found.",
          });
        const updated = await fleetDb.$transaction(async (tx: any) => {
          const next = await tx.inventoryPart.update({
            where: { id: part.id },
            data: {
              quantityOnHand: { increment: input.quantity },
              ...(input.unitCost !== undefined
                ? { unitCost: input.unitCost }
                : {}),
            },
          });
          if (tx.inventoryMovement?.create)
            await tx.inventoryMovement.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                partId: part.id,
                actorId: ctx.fleetopsUser.id,
                movementType: "RECEIPT",
                quantity: input.quantity,
                unitCost: input.unitCost ?? part.unitCost,
                reason: input.reason,
                createdAt: new Date(),
              },
            });
          return next;
        });
        await recordAudit(ctx, {
          action: "INVENTORY_RECEIVED",
          entityType: "INVENTORY_PART",
          entityId: part.id,
          summary: `Received ${input.quantity} units of ${part.name}`,
          metadata: { quantity: input.quantity, reason: input.reason },
        });
        return updated;
      }),
    issue: fleetOpsProcedure
      .input(
        z.object({
          partId: z.string().uuid(),
          quantity: z.number().int().positive(),
          reason: z.string().min(3).max(300),
          workOrderId: z.string().uuid().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "SUPERADMIN",
          "INVENTORY_MANAGER",
          "MECHANIC",
          "TECHNICIAN",
        ]);
        assertWritable(ctx.fleetopsUser.org);
        const part = await fleetDb.inventoryPart.findFirst({
          where: { id: input.partId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!part)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory part not found.",
          });
        if (
          (ctx.fleetopsUser.role === "MECHANIC" ||
            ctx.fleetopsUser.role === "TECHNICIAN") &&
          !input.workOrderId
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Mechanics and Technicians must link issued parts to an assigned work order.",
          });
        const workOrder = input.workOrderId
          ? await fleetDb.workOrder.findFirst({
              where: {
                id: input.workOrderId,
                orgId: ctx.fleetopsUser.orgId,
                status: { notIn: ["COMPLETED", "CANCELLED"] },
                ...(ctx.fleetopsUser.role === "MECHANIC" ||
                ctx.fleetopsUser.role === "TECHNICIAN"
                  ? { assignedMechanicId: ctx.fleetopsUser.id }
                  : {}),
              },
            })
          : null;
        if (input.workOrderId && !workOrder)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Work order is not active or is outside your assigned maintenance scope.",
          });
        if (part.quantityOnHand < input.quantity)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Insufficient inventory for this issue.",
          });
        const updated = await fleetDb.$transaction(async (tx: any) => {
          const changed = await tx.inventoryPart.updateMany({
            where: {
              id: part.id,
              orgId: ctx.fleetopsUser.orgId,
              quantityOnHand: { gte: input.quantity },
            },
            data: { quantityOnHand: { decrement: input.quantity } },
          });
          if (!changed.count)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Inventory changed while this part was being issued. Refresh the balance and retry.",
            });
          const next = await tx.inventoryPart.findFirst({
            where: { id: part.id, orgId: ctx.fleetopsUser.orgId },
          });
          if (tx.inventoryMovement?.create)
            await tx.inventoryMovement.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                partId: part.id,
                workOrderId: input.workOrderId,
                actorId: ctx.fleetopsUser.id,
                movementType: "ISSUE",
                quantity: -input.quantity,
                unitCost: part.unitCost,
                reason: input.reason,
                createdAt: new Date(),
              },
            });
          return next;
        });
        await recordAudit(ctx, {
          action: "INVENTORY_ISSUED",
          entityType: "INVENTORY_PART",
          entityId: part.id,
          summary: `Issued ${input.quantity} units of ${part.name}`,
          metadata: {
            quantity: input.quantity,
            reason: input.reason,
            workOrderId: input.workOrderId ?? null,
          },
        });
        await evaluateLowInventory(ctx.fleetopsUser.orgId);
        return updated;
      }),
    transfer: fleetOpsProcedure
      .input(
        z.object({
          partId: z.string().uuid(),
          toBinLocation: z.string().trim().min(1).max(80),
          reason: z.string().trim().min(3).max(300),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const part = await fleetDb.inventoryPart.findFirst({
          where: { id: input.partId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!part)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory part not found.",
          });
        const updated = await fleetDb.$transaction(async (tx: any) => {
          const next = await tx.inventoryPart.update({
            where: { id: part.id },
            data: { binLocation: input.toBinLocation },
          });
          if (tx.inventoryMovement?.create)
            await tx.inventoryMovement.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                partId: part.id,
                actorId: ctx.fleetopsUser.id,
                movementType: "TRANSFER",
                quantity: 0,
                unitCost: part.unitCost,
                reason: `${part.binLocation ?? "Unassigned"} → ${input.toBinLocation}: ${input.reason}`,
                createdAt: new Date(),
              },
            });
          return next;
        });
        await recordAudit(ctx, {
          action: "INVENTORY_TRANSFERRED",
          entityType: "INVENTORY_PART",
          entityId: part.id,
          summary: `Transferred ${part.name} to ${input.toBinLocation}`,
          metadata: {
            fromBinLocation: part.binLocation,
            toBinLocation: input.toBinLocation,
            reason: input.reason,
          },
        });
        return updated;
      }),
    adjust: fleetOpsProcedure
      .input(
        z.object({
          partId: z.string().uuid(),
          expectedQuantityOnHand: z.number().int().nonnegative(),
          delta: z.number().int(),
          reason: z.string().trim().min(3).max(300),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const part = await fleetDb.inventoryPart.findFirst({
          where: { id: input.partId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!part)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory part not found.",
          });
        const nextQuantity = input.expectedQuantityOnHand + input.delta;
        if (nextQuantity < 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Inventory adjustments cannot produce a negative balance.",
          });
        const updated = await fleetDb.$transaction(async (tx: any) => {
          const changed = await tx.inventoryPart.updateMany({
            where: {
              id: part.id,
              orgId: ctx.fleetopsUser.orgId,
              quantityOnHand: input.expectedQuantityOnHand,
            },
            data: { quantityOnHand: nextQuantity },
          });
          if (!changed.count)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Inventory changed since it was loaded. Refresh the balance and retry.",
            });
          if (tx.inventoryMovement?.create)
            await tx.inventoryMovement.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                partId: part.id,
                actorId: ctx.fleetopsUser.id,
                movementType: "ADJUSTMENT",
                quantity: input.delta,
                unitCost: part.unitCost,
                reason: input.reason,
                createdAt: new Date(),
              },
            });
          return tx.inventoryPart.findFirst({
            where: { id: part.id, orgId: ctx.fleetopsUser.orgId },
          });
        });
        await recordAudit(ctx, {
          action: "INVENTORY_ADJUSTED",
          entityType: "INVENTORY_PART",
          entityId: part.id,
          summary: `Adjusted ${part.name} by ${input.delta}`,
          metadata: {
            expectedQuantityOnHand: input.expectedQuantityOnHand,
            nextQuantity,
            reason: input.reason,
          },
        });
        await evaluateLowInventory(ctx.fleetopsUser.orgId);
        return updated;
      }),
    exportCsv: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      const rows = await fleetDb.inventoryPart.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        orderBy: { sku: "asc" },
      });
      const csv = csvDocument(
        rows.map((row: any) => ({
          sku: row.sku,
          name: row.name,
          binLocation: row.binLocation ?? "",
          quantityOnHand: row.quantityOnHand,
          minReorderLevel: row.minReorderLevel,
          unitCostInr: Number(row.unitCost).toFixed(2),
        })),
        [
          "sku",
          "name",
          "binLocation",
          "quantityOnHand",
          "minReorderLevel",
          "unitCostInr",
        ]
      );
      await recordAudit(ctx, {
        action: "INVENTORY_EXPORT_CSV",
        entityType: "INVENTORY_PART",
        summary: `Exported ${rows.length} inventory parts`,
        metadata: { count: rows.length },
      });
      return {
        filename: `fleetops-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
        content: csv,
        rowCount: rows.length,
      };
    }),
    previewImport: fleetOpsProcedure
      .input(z.object({ csv: z.string().max(1_000_000) }))
      .query(({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        const parsed = parseInventoryCsv(input.csv);
        return {
          rowCount: parsed.rows.length,
          validCount: parsed.rows.filter(row => !row.errors.length).length,
          errors: parsed.errors,
          rows: parsed.rows
            .slice(0, 100)
            .map(item => ({
              rowNumber: item.rowNumber,
              ...item.row,
              errors: item.errors,
            })),
        };
      }),
    importCsv: fleetOpsProcedure
      .input(z.object({ csv: z.string().max(1_000_000) }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const parsed = parseInventoryCsv(input.csv);
        if (parsed.errors.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: parsed.errors.slice(0, 8).join("; "),
          });
        const existing = await fleetDb.inventoryPart.findMany({
          where: { orgId: ctx.fleetopsUser.orgId },
        });
        const seen = new Set(
          existing.map((part: any) => part.sku.toUpperCase())
        );
        const candidates = parsed.rows.filter(item => {
          const sku = String(item.row.sku).toUpperCase();
          if (seen.has(sku)) return false;
          seen.add(sku);
          return true;
        });
        if (candidates.length !== parsed.rows.length)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Every SKU must be unique and must not already exist in this organization.",
          });

        let created: any[] = [];
        try {
          created = await fleetDb.$transaction(async (tx: any) => {
            const rows: any[] = [];
            for (const item of candidates) {
              rows.push(
                await tx.inventoryPart.create({
                data: {
                  id: crypto.randomUUID(),
                  orgId: ctx.fleetopsUser.orgId,
                  sku: item.row.sku,
                  name: item.row.name,
                  binLocation: item.row.binLocation || undefined,
                  quantityOnHand: Number(item.row.quantityOnHand),
                  minReorderLevel: Number(item.row.minReorderLevel),
                  unitCost: Number(item.row.unitCost ?? item.row.unitCostInr),
                },
                })
              );
            }
            return rows;
          });
        } catch (error) {
          console.error(
            "[INVENTORY_IMPORT_ERROR] Failed to create inventory parts from CSV:",
            error
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Failed to create inventory parts. Some SKUs may have been duplicated or contain invalid data.",
          });
        }
        await recordAudit(ctx, {
          action: "INVENTORY_IMPORT_CSV",
          entityType: "INVENTORY_PART",
          summary: `Imported ${created.length} inventory parts`,
          metadata: { count: created.length },
        });
        return { importedCount: created.length };
      }),
  }),
  driver: router({
    inspections: fleetOpsProcedure.query(async ({ ctx }) =>
      fleetDb.dvirInspection.findMany({
        where: { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    ),
    createInspection: fleetOpsProcedure
      .input(
        z.object({
          vehicleId: z.string().uuid(),
          inspectionType: z.enum(["PRE_TRIP", "POST_TRIP"]),
          status: z.enum(["PASS", "FAIL"]),
          notes: z.string().max(2000).optional(),
          photoData: z.string().max(2_000_000).optional(),
          photoContentType: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["DRIVER", "SUPERADMIN"]);
        assertWritable(ctx.fleetopsUser.org);
        await assertDriverVehicle(ctx, input.vehicleId);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found.",
          });
        let photoUrl: string | undefined;
        let photoKey: string | undefined;
        if (input.photoData) {
          const raw = input.photoData.replace(/^data:[^;]+;base64,/, "");
          const uploaded = await storagePut(
            `fleetops/dvir/${ctx.fleetopsUser.orgId}/${vehicle.id}.jpg`,
            Buffer.from(raw, "base64"),
            input.photoContentType ?? "image/jpeg"
          );
          photoUrl = uploaded.url;
          photoKey = uploaded.key;
        }
        const inspection = await fleetDb.dvirInspection.create({
          data: {
            id: crypto.randomUUID(),
            orgId: ctx.fleetopsUser.orgId,
            vehicleId: vehicle.id,
            driverId: ctx.fleetopsUser.id,
            inspectionType: input.inspectionType,
            status: input.status,
            notes: input.notes,
            photoUrl,
            photoKey,
            createdAt: new Date(),
          },
        });
        const managers = await fleetDb.user.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, role: "FLEET_MANAGER" },
        });
        if (managers.length)
          await fleetDb.notification.createMany({
            data: managers.map((manager: any) => ({
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              recipientId: manager.id,
              title: `Driver DVIR: ${input.inspectionType === "PRE_TRIP" ? "Pre-trip" : "Post-trip"} inspection ${input.status}`,
              message: `Driver: ${ctx.fleetopsUser.fullName} · Vehicle: ${vehicleIdentity(vehicle)} · ${input.inspectionType === "PRE_TRIP" ? "Pre-trip" : "Post-trip"} inspection ${input.status === "FAIL" ? "FAILED" : "passed"}${input.notes ? ` · Notes: ${input.notes.slice(0, 100)}` : ""}`,
              type: "DVIR_INSPECTION",
              severity: input.status === "FAIL" ? "HIGH" : "INFO",
              sourceType: "DVIR_INSPECTION",
              referenceId: inspection.id,
              isRead: false,
              createdAt: new Date(),
            })),
          });
        await recordAudit(ctx, {
          action: "DVIR_INSPECTION_CREATED",
          entityType: "DVIR_INSPECTION",
          entityId: inspection.id,
          summary: `${input.inspectionType} inspection ${input.status === "PASS" ? "passed" : "FAILED"} for ${vehicleIdentity(vehicle)}`,
          metadata: {
            vehicleId: vehicle.id,
            inspectionType: input.inspectionType,
            status: input.status,
            driverId: ctx.fleetopsUser.id,
            driverName: ctx.fleetopsUser.fullName,
          },
        });
        return inspection;
      }),
    fuelLogs: fleetOpsProcedure.query(({ ctx }) =>
      fleetDb.fuelLog.findMany({
        where: { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    ),
    createFuelLog: fleetOpsProcedure
      .input(
        z.object({
          vehicleId: z.string().uuid(),
          liters: z.number().positive(),
          amount: z.number().nonnegative(),
          odometer: z.number().nonnegative(),
          station: z.string().max(200).optional(),
          receiptData: z.string().max(2_000_000).optional(),
          receiptContentType: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["DRIVER", "SUPERADMIN"]);
        assertWritable(ctx.fleetopsUser.org);
        await assertDriverVehicle(ctx, input.vehicleId);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found.",
          });
        const previousLog = await fleetDb.odometerLog.findFirst({
          where: { vehicleId: vehicle.id },
          orderBy: { createdAt: "desc" },
        });
        const elapsedDays = previousLog?.createdAt
          ? Math.max(
              1,
              Math.ceil(
                (Date.now() - new Date(previousLog.createdAt).getTime()) /
                  86_400_000
              )
            )
          : 1;
        validateOdometerReading(
          previousLog
            ? Number(previousLog.reading)
            : Number(vehicle.currentOdometer),
          input.odometer,
          elapsedDays
        );
        let receiptUrl: string | undefined;
        if (input.receiptData)
          receiptUrl = (
            await storagePut(
              `fleetops/fuel/${ctx.fleetopsUser.orgId}/${vehicle.id}.jpg`,
              Buffer.from(
                input.receiptData.replace(/^data:[^;]+;base64,/, ""),
                "base64"
              ),
              input.receiptContentType ?? "image/jpeg"
            )
          ).url;
        const log = await fleetDb.$transaction(async (tx: any) => {
          const createdLog = await tx.fuelLog.create({
            data: {
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              vehicleId: vehicle.id,
              driverId: ctx.fleetopsUser.id,
              liters: input.liters,
              amount: input.amount,
              odometer: input.odometer,
              station: input.station,
              receiptUrl,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          await tx.financialRecord.create({
            data: {
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              vehicleId: vehicle.id,
              type: "EXPENSE",
              category: "FUEL",
              amount: input.amount,
              transactionDate: new Date(),
            },
          });
          await tx.odometerLog.create({
            data: {
              id: crypto.randomUUID(),
              vehicleId: vehicle.id,
              driverId: ctx.fleetopsUser.id,
              reading: input.odometer,
              source: "MANUAL_DRIVER",
              isFlagged: false,
              createdAt: new Date(),
            },
          });
          await tx.vehicle.update({
            where: { id: vehicle.id },
            data: { currentOdometer: input.odometer },
          });
          return createdLog;
        });
        await evaluateVehicleMaintenance(vehicle.id, ctx.fleetopsUser.orgId);
        return log;
      }),
    dailyHome: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["DRIVER"]);
      const assignments = await fleetDb.vehicleAssignment.findMany({
        where: {
          orgId: ctx.fleetopsUser.orgId,
          driverId: ctx.fleetopsUser.id,
          active: true,
        },
      });
      const assigned = assignments[0];
      if (!assigned)
        return {
          vehicle: null,
          readiness: "UNASSIGNED",
          latestInspection: null,
          openIssues: [],
          nextAction: "Contact Fleet Manager for an active vehicle assignment.",
        };
      const vehicle = await fleetDb.vehicle.findFirst({
        where: { id: assigned.vehicleId, orgId: ctx.fleetopsUser.orgId },
      });
      const latestOdometer = await fleetDb.odometerLog.findFirst({
        where: { vehicleId: assigned.vehicleId },
        orderBy: { createdAt: "desc" },
      });
      const inspections = await fleetDb.dvirInspection.findMany({
        where: {
          orgId: ctx.fleetopsUser.orgId,
          driverId: ctx.fleetopsUser.id,
          vehicleId: assigned.vehicleId,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      const openIssues = await fleetDb.vehicleIssue.findMany({
        where: {
          orgId: ctx.fleetopsUser.orgId,
          driverId: ctx.fleetopsUser.id,
          vehicleId: assigned.vehicleId,
          status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const latestInspection = inspections[0] ?? null;
      const readiness =
        vehicle?.status === "OUT_OF_SERVICE"
          ? "UNSAFE"
          : latestInspection?.inspectionType === "PRE_TRIP" &&
              latestInspection.status === "PASS" &&
              !openIssues.some((issue: any) =>
                ["HIGH", "CRITICAL"].includes(issue.priority)
              )
            ? "READY"
            : "ACTION_REQUIRED";
      const canonicalVehicle = vehicle
        ? {
            ...vehicle,
            currentOdometer: latestOdometer?.reading ?? vehicle.currentOdometer,
            latestOdometerReading:
              latestOdometer?.reading ?? vehicle.currentOdometer,
            latestOdometerAt: latestOdometer?.createdAt ?? vehicle.updatedAt,
            latestOdometerSource: latestOdometer?.source ?? "VEHICLE_RECORD",
          }
        : null;
      return {
        vehicle: canonicalVehicle,
        readiness,
        latestInspection,
        openIssues,
        nextAction:
          readiness === "READY"
            ? "Vehicle cleared for shift."
            : readiness === "UNSAFE"
              ? "Do not drive. Fleet Manager disposition required."
              : "Complete a passing pre-trip inspection and resolve high-priority issues.",
      };
    }),
    unsafeDisposition: fleetOpsProcedure
      .input(
        z.object({
          vehicleId: z.string().uuid(),
          disposition: z.enum(["UNSAFE_TO_DRIVE", "CLEARED_TO_DRIVE"]),
          notes: z.string().trim().min(3).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["DRIVER"]);
        assertWritable(ctx.fleetopsUser.org);
        await assertDriverVehicle(ctx, input.vehicleId);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Assigned vehicle not found.",
          });
        const nextStatus =
          input.disposition === "UNSAFE_TO_DRIVE" ? "OUT_OF_SERVICE" : "ACTIVE";
        const updated = await fleetDb.vehicle.update({
          where: { id: vehicle.id },
          data: { status: nextStatus },
        });
        const managers = await fleetDb.user.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, role: "FLEET_MANAGER" },
        });
        if (managers.length)
          await fleetDb.notification.createMany({
            data: managers.map((manager: any) => ({
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              recipientId: manager.id,
              title:
                input.disposition === "UNSAFE_TO_DRIVE"
                  ? "Driver marked vehicle unsafe"
                  : "Driver cleared vehicle",
              message: `${vehicleIdentity(vehicle)}: ${input.notes}`,
              type: "DRIVER_SAFETY_DISPOSITION",
              severity:
                input.disposition === "UNSAFE_TO_DRIVE" ? "CRITICAL" : "INFO",
              sourceType: "VEHICLE",
              dedupeKey: `DRIVER_SAFETY:${vehicle.id}:${input.disposition}`,
              referenceId: vehicle.id,
              isRead: false,
              createdAt: new Date(),
            })),
          });
        await recordAudit(ctx, {
          action: "DRIVER_SAFETY_DISPOSITION",
          entityType: "VEHICLE",
          entityId: vehicle.id,
          summary: `${vehicleIdentity(vehicle)} marked ${input.disposition}`,
          metadata: { disposition: input.disposition, notes: input.notes },
        });
        return updated;
      }),
  }),
  vehicleIssues: router({
    list: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, [
        "SUPERADMIN",
        "FLEET_MANAGER",
        "DRIVER",
      ]);
      const where =
        ctx.fleetopsUser.role === "DRIVER"
          ? { orgId: ctx.fleetopsUser.orgId, driverId: ctx.fleetopsUser.id }
          : { orgId: ctx.fleetopsUser.orgId };
      return fleetDb.vehicleIssue.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }),
    create: fleetOpsProcedure
      .input(
        z.object({
          vehicleId: z.string().uuid(),
          title: z.string().trim().min(3).max(160),
          description: z.string().trim().min(5).max(4000),
          priority: z
            .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
            .default("MEDIUM"),
          photoData: z.string().max(4_000_000).optional(),
          photoContentType: z.string().startsWith("image/").optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["DRIVER"]);
        assertWritable(ctx.fleetopsUser.org);
        await assertDriverVehicle(ctx, input.vehicleId);
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found.",
          });
        let photoUrl: string | undefined;
        let photoKey: string | undefined;
        if (input.photoData) {
          const uploaded = await storagePut(
            `fleetops/vehicle-issues/${ctx.fleetopsUser.orgId}/${input.vehicleId}/${Date.now()}.jpg`,
            Buffer.from(
              input.photoData.replace(/^data:[^;]+;base64,/, ""),
              "base64"
            ),
            input.photoContentType ?? "image/jpeg"
          );
          photoUrl = uploaded.url;
          photoKey = uploaded.key;
        }
        const issue = await fleetDb.vehicleIssue.create({
          data: {
            id: crypto.randomUUID(),
            orgId: ctx.fleetopsUser.orgId,
            vehicleId: input.vehicleId,
            driverId: ctx.fleetopsUser.id,
            title: input.title,
            description: input.description,
            priority: input.priority,
            status: "OPEN",
            photoUrl,
            photoKey,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        const managers = await fleetDb.user.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, role: "FLEET_MANAGER" },
        });
        if (managers.length)
          await fleetDb.notification.createMany({
            data: managers.map((manager: any) => ({
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              recipientId: manager.id,
              title: `${input.priority} priority issue: ${input.title}`,
              message: `Driver: ${ctx.fleetopsUser.fullName} · Vehicle: ${vehicleIdentity(vehicle)} · Issue: ${input.title} · Priority: ${input.priority}`,
              type: "VEHICLE_ISSUE",
              severity:
                input.priority === "CRITICAL"
                  ? "CRITICAL"
                  : input.priority === "HIGH"
                    ? "HIGH"
                    : "INFO",
              sourceType: "VEHICLE_ISSUE",
              dedupeKey: `VEHICLE_ISSUE:${issue.id}`,
              referenceId: issue.id,
              isRead: false,
              createdAt: new Date(),
            })),
          });
        await recordAudit(ctx, {
          action: "VEHICLE_ISSUE_REPORTED",
          entityType: "VEHICLE_ISSUE",
          entityId: issue.id,
          summary: `Driver reported vehicle issue: ${issue.title}`,
          metadata: {
            priority: issue.priority,
            vehicleId: vehicle.id,
            driverId: ctx.fleetopsUser.id,
            driverName: ctx.fleetopsUser.fullName,
            vehicleIdentity: vehicleIdentity(vehicle),
          },
        });
        return issue;
      }),
    updateStatus: fleetOpsProcedure
      .input(
        z.object({
          issueId: z.string().uuid(),
          status: z.enum([
            "OPEN",
            "ACKNOWLEDGED",
            "IN_PROGRESS",
            "RESOLVED",
            "CLOSED",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const issue = await fleetDb.vehicleIssue.findFirst({
          where: { id: input.issueId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!issue)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle issue not found in this organization.",
          });
        const updated = await fleetDb.vehicleIssue.update({
          where: { id: issue.id },
          data: { status: input.status },
        });
        await recordAudit(ctx, {
          action: "VEHICLE_ISSUE_STATUS_CHANGED",
          entityType: "VEHICLE_ISSUE",
          entityId: issue.id,
          summary: `Vehicle issue moved from ${issue.status} to ${input.status}`,
          metadata: { previousStatus: issue.status, nextStatus: input.status },
        });
        return updated;
      }),
  }),
  triage: router({
    update: fleetOpsProcedure
      .input(
        z.object({
          kind: z.enum([
            "VEHICLE_ISSUE",
            "WORK_ORDER",
            "DOCUMENT",
            "LOW_STOCK",
          ]),
          referenceId: z.string().uuid(),
          state: z.enum(["ACKNOWLEDGED", "ASSIGNED", "DEFERRED", "RESOLVED"]),
          note: z.string().trim().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const triageEntity =
          input.kind === "VEHICLE_ISSUE"
            ? await fleetDb.vehicleIssue.findFirst({
                where: { id: input.referenceId, orgId: ctx.fleetopsUser.orgId },
              })
            : input.kind === "WORK_ORDER"
              ? await fleetDb.workOrder.findFirst({
                  where: {
                    id: input.referenceId,
                    orgId: ctx.fleetopsUser.orgId,
                  },
                })
              : input.kind === "DOCUMENT"
                ? await fleetDb.document.findFirst({
                    where: {
                      id: input.referenceId,
                      orgId: ctx.fleetopsUser.orgId,
                    },
                  })
                : await fleetDb.inventoryPart.findFirst({
                    where: {
                      id: input.referenceId,
                      orgId: ctx.fleetopsUser.orgId,
                    },
                  });
        if (!triageEntity)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Triage item was not found in this organization.",
          });
        await recordAudit(ctx, {
          action: "TRIAGE_STATE_CHANGED",
          entityType: input.kind,
          entityId: input.referenceId,
          summary: `${input.kind} triage marked ${input.state.toLowerCase()}`,
          metadata: {
            state: input.state,
            assigneeId: input.state === "ASSIGNED" ? ctx.fleetopsUser.id : null,
            note: input.note ?? null,
          },
        });
        return {
          kind: input.kind,
          referenceId: input.referenceId,
          state: input.state,
          assigneeId: input.state === "ASSIGNED" ? ctx.fleetopsUser.id : null,
        };
      }),
    createWorkOrderFromIssue: fleetOpsProcedure
      .input(
        z.object({
          issueId: z.string().uuid(),
          assignedMechanicId: z.string().uuid().optional(),
          priority: z.nativeEnum(Priority).optional(),
          note: z.string().trim().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const issue = await fleetDb.vehicleIssue.findFirst({
          where: { id: input.issueId, orgId: ctx.fleetopsUser.orgId },
          include: { vehicle: true },
        });
        if (!issue)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle issue not found in this organization.",
          });
        if (["RESOLVED", "CLOSED"].includes(issue.status))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Resolved issues cannot be dispatched.",
          });
        if (input.assignedMechanicId) {
          const assignee = await fleetDb.user.findFirst({
            where: {
              id: input.assignedMechanicId,
              orgId: ctx.fleetopsUser.orgId,
              role: { in: ["MECHANIC", "TECHNICIAN"] },
            },
          });
          if (!assignee)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Assignee must belong to this organization and be a mechanic or technician.",
            });
        }
        const existingLinks = await fleetDb.auditEvent.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            action: "WORK_ORDER_CREATED",
            entityType: "WORK_ORDER",
          },
        });
        const alreadyDispatched = (existingLinks as any[]).some(event => {
          try {
            return (
              JSON.parse(event.metadata ?? "{}").sourceIssueId === issue.id
            );
          } catch {
            return false;
          }
        });
        if (alreadyDispatched)
          throw new TRPCError({
            code: "CONFLICT",
            message: "This driver issue already has a dispatched work order.",
          });
        const workOrder = await fleetDb.workOrder.create({
          data: {
            id: crypto.randomUUID(),
            orgId: ctx.fleetopsUser.orgId,
            vehicleId: issue.vehicleId,
            title: `Driver issue: ${issue.title}`,
            description: [issue.description, input.note]
              .filter(Boolean)
              .join("\n\n"),
            priority: input.priority ?? issue.priority,
            status: "OPEN",
            assignedMechanicId: input.assignedMechanicId,
            createdAt: new Date(),
          },
        });
        await fleetDb.vehicleIssue.update({
          where: { id: issue.id },
          data: { status: "ACKNOWLEDGED", updatedAt: new Date() },
        });
        await recordAudit(ctx, {
          action: "WORK_ORDER_CREATED",
          entityType: "WORK_ORDER",
          entityId: workOrder.id,
          summary: `Work order dispatched from driver issue: ${issue.title}`,
          metadata: {
            sourceIssueId: issue.id,
            sourceType: "VEHICLE_ISSUE",
            assignedMechanicId: input.assignedMechanicId ?? null,
          },
        });
        await recordAudit(ctx, {
          action: "VEHICLE_ISSUE_DISPATCHED",
          entityType: "VEHICLE_ISSUE",
          entityId: issue.id,
          summary: `Driver issue dispatched to maintenance: ${issue.title}`,
          metadata: {
            workOrderId: workOrder.id,
            assignedMechanicId: input.assignedMechanicId ?? null,
          },
        });
        return workOrder;
      }),
    queue: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const cutoff = new Date(Date.now() + 30 * 86_400_000);
      const [issues, orders, documents, parts, triageAudits] =
        await Promise.all([
          fleetDb.vehicleIssue.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              status: { notIn: ["RESOLVED", "CLOSED"] },
            },
            include: { vehicle: true },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
          fleetDb.workOrder.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
            include: { vehicle: true, assignedMechanic: true },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
          fleetDb.document.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              expiryDate: { lte: cutoff },
            },
            include: { vehicle: true },
            orderBy: { expiryDate: "asc" },
            take: 50,
          }),
          fleetDb.inventoryPart.findMany({
            where: { orgId: ctx.fleetopsUser.orgId },
            orderBy: { name: "asc" },
            take: 200,
          }),
          fleetDb.auditEvent.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              action: "TRIAGE_STATE_CHANGED",
            },
            orderBy: { createdAt: "desc" },
            take: 500,
          }),
        ]);
      const triageState = new Map<string, string>();
      for (const event of triageAudits as any[]) {
        const key = `${event.entityType}:${event.entityId}`;
        if (!triageState.has(key)) {
          try {
            const metadata = JSON.parse(event.metadata ?? "{}");
            triageState.set(
              key,
              metadata.state
                ? `${metadata.state}${metadata.assigneeId ? `:${metadata.assigneeId}` : ""}`
                : ""
            );
          } catch {
            triageState.set(key, "");
          }
        }
      }
      const withState = (item: any, kind: string) => ({
        ...item,
        triageState: triageState.get(`${kind}:${item.referenceId}`) ?? null,
      });
      const issueItems = issues.map((item: any) =>
        withState(
          {
            id: item.id,
            kind: "VEHICLE_ISSUE",
            title: item.title,
            subtitle: `${item.vehicle ? vehicleIdentity(item.vehicle) : item.vehicleId} · Driver issue`,
            priority: item.priority,
            status: item.status,
            createdAt: item.createdAt,
            referenceId: item.id,
            actionable: true,
          },
          "VEHICLE_ISSUE"
        )
      );
      const orderItems = orders.map((item: any) =>
        withState(
          {
            id: item.id,
            kind: "WORK_ORDER",
            title: item.title,
            subtitle: `${item.vehicle ? vehicleIdentity(item.vehicle) : item.vehicleId} · ${item.assignedMechanic?.fullName ?? "Unassigned"}`,
            priority: item.priority,
            status: item.status,
            createdAt: item.createdAt,
            referenceId: item.id,
            actionable: true,
          },
          "WORK_ORDER"
        )
      );
      const documentItems = documents.map((item: any) =>
        withState(
          {
            id: item.id,
            kind: "DOCUMENT",
            title: item.title,
            subtitle: `${item.vehicle ? vehicleIdentity(item.vehicle) : "Organization document"} · expires ${new Date(item.expiryDate).toLocaleDateString("en-IN")}`,
            priority:
              new Date(item.expiryDate) < new Date() ? "CRITICAL" : "HIGH",
            status: "REVIEW",
            createdAt: item.createdAt,
            referenceId: item.id,
            actionable: true,
          },
          "DOCUMENT"
        )
      );
      const lowStockItems = parts
        .filter(
          (item: any) =>
            Number(item.quantityOnHand) <= Number(item.minReorderLevel)
        )
        .map((item: any) =>
          withState(
            {
              id: item.id,
              kind: "LOW_STOCK",
              title: `${item.sku} · ${item.name}`,
              subtitle: `${item.quantityOnHand} on hand · reorder at ${item.minReorderLevel}`,
              priority: "HIGH",
              status: "REORDER",
              createdAt: item.updatedAt ?? item.createdAt,
              referenceId: item.id,
              actionable: true,
            },
            "LOW_STOCK"
          )
        );
      return [...issueItems, ...orderItems, ...documentItems, ...lowStockItems]
        .filter(
          (item: any) =>
            !["DEFERRED", "RESOLVED"].includes(
              String(item.triageState).split(":")[0]
            )
        )
        .sort((a: any, b: any) => {
          const rank: Record<string, number> = {
            CRITICAL: 0,
            HIGH: 1,
            MEDIUM: 2,
            LOW: 3,
          };
          return (
            (rank[a.priority] ?? 4) - (rank[b.priority] ?? 4) ||
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        })
        .slice(0, 100);
    }),
  }),
  audit: router({
    list: fleetOpsProcedure
      .input(
        z
          .object({
            actorId: z.string().uuid().optional(),
            actorRole: z.string().optional(),
            entityType: z.string().optional(),
            action: z.string().optional(),
            outcome: z.enum(["SUCCESS", "ERROR"]).optional(),
            dateFrom: z.string().datetime().optional(),
            dateTo: z.string().datetime().optional(),
            limit: z.number().int().min(1).max(200).default(100),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        const rows = await fleetDb.auditEvent.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            ...(input?.actorId ? { actorId: input.actorId } : {}),
            ...(input?.actorRole ? { actorRole: input.actorRole } : {}),
            ...(input?.entityType ? { entityType: input.entityType } : {}),
            ...(input?.action ? { action: input.action } : {}),
            ...(input?.dateFrom || input?.dateTo
              ? {
                  createdAt: {
                    ...(input?.dateFrom
                      ? { gte: new Date(input.dateFrom) }
                      : {}),
                    ...(input?.dateTo ? { lte: new Date(input.dateTo) } : {}),
                  },
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take: input?.limit ?? 100,
        });
        if (!input?.outcome) return rows;
        return rows.filter((row: any) => {
          let metadata: any = {};
          try {
            metadata = row.metadata ? JSON.parse(row.metadata) : {};
          } catch {
            metadata = {};
          }
          const outcome = String(metadata.outcome ?? "SUCCESS").toUpperCase();
          return outcome === input.outcome;
        });
      }),
  }),
  automation: router({
    evaluate: fleetOpsProcedure.mutation(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      return evaluateAllOrganizations();
    }),
  }),
  team: router({
    members: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      return fleetDb.user.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
        orderBy: { fullName: "asc" },
      });
    }),
    assignableMembers: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      return fleetDb.user.findMany({
        where: {
          orgId: ctx.fleetopsUser.orgId,
          role: { in: ["MECHANIC", "TECHNICIAN"] },
        },
        select: { id: true, fullName: true, role: true },
        orderBy: { fullName: "asc" },
      });
    }),
    invitations: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const invitations = await fleetDb.invitation.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        orderBy: { createdAt: "desc" },
      });
      return invitations.map(
        ({ tokenHash: _tokenHash, ...invitation }: any) => invitation
      );
    }),
    invite: fleetOpsProcedure
      .input(
        z.object({
          email: z.string().email(),
          role: z.enum([
            "FLEET_MANAGER",
            "MECHANIC",
            "TECHNICIAN",
            "DRIVER",
            "INVENTORY_MANAGER",
            "ACCOUNTANT",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        assertWritable(ctx.fleetopsUser.org);
        const normalizedEmail = input.email.toLowerCase();
        const existing = await fleetDb.invitation.findFirst({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            email: normalizedEmail,
            acceptedAt: null,
            revokedAt: null,
          },
        });
        if (existing && new Date(existing.expiresAt).getTime() > Date.now())
          throw new TRPCError({
            code: "CONFLICT",
            message: "An active invitation already exists for this email.",
          });
        const token = crypto.randomUUID();
        const invitation = await withServerTimeout<any>(
          fleetDb.invitation.create({
            data: {
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              email: normalizedEmail,
              role: input.role,
              tokenHash: hashInvitationToken(token),
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              lastSentAt: new Date(),
              createdAt: new Date(),
            },
          }),
          "Invitation storage did not respond within 12 seconds. No invitation was confirmed."
        );
        await recordAudit(ctx, {
          action: "INVITATION_CREATED",
          entityType: "INVITATION",
          entityId: invitation.id,
          summary: `Invitation created for ${input.email.toLowerCase()}`,
          metadata: { role: input.role },
        });
        const origin = String(
          ctx.req?.headers?.origin ??
            process.env.PUBLIC_APP_URL ??
            "https://fleetops-v2.vercel.app"
        );
        const joinUrl = new URL(`/join/${token}`, origin).toString();
        const authInvite = await createAuthInvitation(normalizedEmail, joinUrl);
        const emailResult = authInvite.error
          ? { error: { message: authInvite.error.message } }
          : await sendInvitationEmail({
              organizationName: ctx.fleetopsUser.org.name,
              inviteeEmail: normalizedEmail,
              role: input.role,
              joinUrl,
              expiresAt: invitation.expiresAt
                ? new Date(invitation.expiresAt)
                : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            });
        return {
          ...(invitation as Record<string, unknown>),
          joinUrl,
          delivery: emailResult.error
            ? ("MANUAL_TOKEN" as const)
            : ("EMAIL" as const),
          deliveryError: emailResult.error?.message,
          serverRelease: FLEETOPS_SERVER_RELEASE,
        };
      }),
    resendInvitation: fleetOpsProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        assertWritable(ctx.fleetopsUser.org);
        const invitation = await fleetDb.invitation.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!invitation)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invitation not found in this organization.",
          });
        if (invitation.acceptedAt || invitation.revokedAt)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Accepted or revoked invitations cannot be resent.",
          });
        const token = crypto.randomUUID();
        const updated = await fleetDb.invitation.update({
          where: { id: invitation.id },
          data: {
            tokenHash: hashInvitationToken(token),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            resendCount: Number(invitation.resendCount ?? 0) + 1,
            lastSentAt: new Date(),
          },
        });
        const origin = String(
          ctx.req?.headers?.origin ??
            process.env.PUBLIC_APP_URL ??
            "https://fleetops-v2.vercel.app"
        );
        const joinUrl = new URL(`/join/${token}`, origin).toString();
        const authInvite = await createAuthInvitation(
          invitation.email,
          joinUrl
        );
        const emailResult = authInvite.error
          ? { error: { message: authInvite.error.message } }
          : await sendInvitationEmail({
              organizationName: ctx.fleetopsUser.org.name,
              inviteeEmail: invitation.email,
              role: invitation.role,
              joinUrl,
              expiresAt: updated.expiresAt
                ? new Date(updated.expiresAt)
                : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            });
        await recordAudit(ctx, {
          action: "INVITATION_RESENT",
          entityType: "INVITATION",
          entityId: invitation.id,
          summary: `Invitation resent to ${invitation.email}`,
          metadata: {
            resendCount: updated.resendCount,
            delivery: emailResult.error ? "MANUAL_TOKEN" : "EMAIL",
          },
        });
        return {
          ...(updated as Record<string, unknown>),
          joinUrl,
          delivery: emailResult.error
            ? ("MANUAL_TOKEN" as const)
            : ("EMAIL" as const),
          deliveryError: emailResult.error?.message,
          serverRelease: FLEETOPS_SERVER_RELEASE,
        };
      }),
    revokeInvitation: fleetOpsProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          reason: z.string().trim().min(3).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        assertWritable(ctx.fleetopsUser.org);
        const invitation = await fleetDb.invitation.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!invitation)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invitation not found in this organization.",
          });
        if (invitation.acceptedAt)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Accepted invitations cannot be revoked.",
          });
        if (invitation.revokedAt) return invitation;
        const revoked = await fleetDb.invitation.update({
          where: { id: invitation.id },
          data: { revokedAt: new Date(), revokedById: ctx.fleetopsUser.id },
        });
        await recordAudit(ctx, {
          action: "INVITATION_REVOKED",
          entityType: "INVITATION",
          entityId: invitation.id,
          summary: `Invitation revoked for ${invitation.email}`,
          metadata: { reason: input.reason },
        });
        return revoked;
      }),
    updateRole: fleetOpsProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          role: z.enum([
            "FLEET_MANAGER",
            "MECHANIC",
            "TECHNICIAN",
            "DRIVER",
            "INVENTORY_MANAGER",
            "ACCOUNTANT",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        assertWritable(ctx.fleetopsUser.org);
        const member = await fleetDb.user.findFirst({
          where: { id: input.userId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!member)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Team member not found.",
          });
        const updated = await fleetDb.user.update({
          where: { id: input.userId },
          data: { role: input.role },
        });
        await recordAudit(ctx, {
          action: "ROLE_CHANGED",
          entityType: "USER",
          entityId: member.id,
          summary: `Role changed for ${member.fullName}`,
          metadata: { previousRole: member.role, nextRole: input.role },
        });
        return updated;
      }),
    removeMember: fleetOpsProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        assertWritable(ctx.fleetopsUser.org);
        if (input.userId === ctx.fleetopsUser.id)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You cannot remove your own organization owner account.",
          });
        const member = await fleetDb.user.findFirst({
          where: { id: input.userId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!member)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Team member not found in this organization.",
          });
        if (member.role === "SUPERADMIN")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Organization owner accounts cannot be removed from Team.",
          });
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
          member.authUserId
        );
        if (authError && !/not found|already deleted/i.test(authError.message))
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Auth account could not be removed: ${authError.message}`,
          });
        const deleted = await fleetDb.user.delete({ where: { id: member.id } });
        await recordAudit(ctx, {
          action: "TEAM_MEMBER_REMOVED",
          entityType: "USER",
          entityId: member.id,
          summary: `Removed ${member.fullName} from the organization`,
          metadata: {
            email: member.email,
            role: member.role,
            authUserId: member.authUserId,
          },
        });
        return { id: deleted.id, email: deleted.email, role: deleted.role };
      }),
    operationalRoster: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["FLEET_MANAGER"]);
      const [members, assignments, vehicles] = await Promise.all([
        fleetDb.user.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            role: { in: ["DRIVER", "MECHANIC", "TECHNICIAN"] },
          },
          select: { id: true, fullName: true, email: true, role: true },
          orderBy: { fullName: "asc" },
        }),
        fleetDb.vehicleAssignment.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, active: true },
          orderBy: { updatedAt: "desc" },
        }),
        fleetDb.vehicle.findMany({
          where: { orgId: ctx.fleetopsUser.orgId },
          select: { id: true, licensePlate: true, make: true, model: true },
        }),
      ]);
      const memberById = new Map(
        members.map((member: any) => [member.id, member])
      );
      const vehicleById = new Map(
        vehicles.map((vehicle: any) => [vehicle.id, vehicle])
      );
      const enrichedAssignments = assignments.map((assignment: any) => ({
        ...assignment,
        driver: memberById.get(assignment.driverId),
        vehicle: vehicleById.get(assignment.vehicleId),
      }));
      return {
        members,
        assignments: enrichedAssignments,
        activeAssignmentCount: enrichedAssignments.length,
        unassignedDrivers: members.filter(
          (member: any) =>
            member.role === "DRIVER" &&
            !enrichedAssignments.some(
              (assignment: any) => assignment.driverId === member.id
            )
        ).length,
        unassignedVehicles: vehicles.filter(
          (vehicle: any) =>
            !enrichedAssignments.some(
              (assignment: any) => assignment.vehicleId === vehicle.id
            )
        ).length,
      };
    }),
    driverHandoffs: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const [assignments, drivers, vehicles, issues, safetyNotifications] =
        await Promise.all([
          fleetDb.vehicleAssignment.findMany({
            where: { orgId: ctx.fleetopsUser.orgId, active: true },
            orderBy: { updatedAt: "desc" },
          }),
          fleetDb.user.findMany({
            where: { orgId: ctx.fleetopsUser.orgId, role: "DRIVER" },
            select: { id: true, fullName: true, email: true },
          }),
          fleetDb.vehicle.findMany({
            where: { orgId: ctx.fleetopsUser.orgId },
            select: {
              id: true,
              licensePlate: true,
              make: true,
              model: true,
              status: true,
            },
          }),
          fleetDb.vehicleIssue.findMany({
            where: { orgId: ctx.fleetopsUser.orgId },
            orderBy: { createdAt: "desc" },
            take: 500,
          }),
          fleetDb.notification.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              type: "DRIVER_SAFETY_DISPOSITION",
            },
            orderBy: { createdAt: "desc" },
            take: 500,
          }),
        ]);
      const driverById = new Map<string, { fullName: string; email: string }>(
        drivers.map(
          (driver: any) =>
            [driver.id, driver] as [string, { fullName: string; email: string }]
        )
      );
      const vehicleById = new Map<
        string,
        { licensePlate: string; make: string; model: string; status: string }
      >(
        vehicles.map(
          (vehicle: any) =>
            [vehicle.id, vehicle] as [
              string,
              {
                licensePlate: string;
                make: string;
                model: string;
                status: string;
              },
            ]
        )
      );
      const latestIssueByVehicle = new Map<string, any>();
      for (const issue of issues as any[])
        if (!latestIssueByVehicle.has(issue.vehicleId))
          latestIssueByVehicle.set(issue.vehicleId, issue);
      const latestDispositionByVehicle = new Map<string, any>();
      for (const notification of safetyNotifications as any[])
        if (!latestDispositionByVehicle.has(notification.referenceId))
          latestDispositionByVehicle.set(
            notification.referenceId,
            notification
          );
      return assignments.map((assignment: any) => {
        const vehicle = vehicleById.get(assignment.vehicleId);
        const driver = driverById.get(assignment.driverId);
        const issue = latestIssueByVehicle.get(assignment.vehicleId);
        const disposition = latestDispositionByVehicle.get(
          assignment.vehicleId
        );
        const safety =
          vehicle?.status === "OUT_OF_SERVICE"
            ? "UNSAFE"
            : vehicle?.status === "ACTIVE"
              ? "ACTIVE"
              : "REVIEW";
        return {
          assignmentId: assignment.id,
          driverId: assignment.driverId,
          driverName: driver?.fullName ?? "Unknown driver",
          driverEmail: driver?.email ?? "",
          vehicleId: assignment.vehicleId,
          vehicleLabel: vehicle?.licensePlate ?? assignment.vehicleId,
          vehicleStatus: vehicle?.status ?? "UNKNOWN",
          safety,
          latestIssue: issue
            ? {
                id: issue.id,
                title: issue.title,
                priority: issue.priority,
                status: issue.status,
                createdAt: issue.createdAt,
              }
            : null,
          latestDisposition: disposition
            ? {
                severity: disposition.severity,
                message: disposition.message,
                createdAt: disposition.createdAt,
              }
            : null,
          acknowledgedAt:
            issue?.status === "ACKNOWLEDGED" ? issue.updatedAt : null,
        };
      });
    }),
    assignVehicle: fleetOpsProcedure
      .input(
        z.object({
          driverId: z.string().uuid(),
          vehicleId: z.string().uuid(),
          active: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const driver = await fleetDb.user.findFirst({
          where: {
            id: input.driverId,
            orgId: ctx.fleetopsUser.orgId,
            role: "DRIVER",
          },
        });
        const vehicle = await fleetDb.vehicle.findFirst({
          where: { id: input.vehicleId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!driver || !vehicle)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Driver or vehicle not found in this organization.",
          });
        const conflicting = await fleetDb.vehicleAssignment.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, active: true },
        });
        const closed = conflicting.filter(
          (item: any) =>
            item.driverId === input.driverId ||
            item.vehicleId === input.vehicleId
        );
        await Promise.all(
          closed.map((item: any) =>
            fleetDb.vehicleAssignment.update({
              where: { id: item.id },
              data: { active: false },
            })
          )
        );
        const assignment = await fleetDb.vehicleAssignment.create({
          data: {
            id: crypto.randomUUID(),
            orgId: ctx.fleetopsUser.orgId,
            vehicleId: input.vehicleId,
            driverId: input.driverId,
            active: input.active,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        await recordAudit(ctx, {
          action: closed.length ? "VEHICLE_REASSIGNED" : "VEHICLE_ASSIGNED",
          entityType: "VEHICLE_ASSIGNMENT",
          entityId: assignment.id,
          summary: `${closed.length ? "Reassigned" : "Assigned"} ${vehicleIdentity(vehicle)} to ${driver.fullName}`,
          metadata: {
            vehicleId: input.vehicleId,
            driverId: input.driverId,
            active: input.active,
            closedAssignmentIds: closed.map((item: any) => item.id),
          },
        });
        return { ...assignment, closedAssignments: closed.length };
      }),
  }),
  vendors: router({
    list: fleetOpsProcedure.query(({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      return fleetDb.vendor.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        orderBy: { name: "asc" },
      });
    }),
    create: fleetOpsProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          contactPerson: z.string().trim().max(120).optional(),
          phone: z.string().trim().min(5).max(40),
          email: z.string().trim().email().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const created = await fleetDb.vendor.create({
          data: {
            id: crypto.randomUUID(),
            orgId: ctx.fleetopsUser.orgId,
            name: input.name,
            contactPerson: input.contactPerson || undefined,
            phone: input.phone,
            email: input.email || undefined,
            createdAt: new Date(),
          },
        });
        await recordAudit(ctx, {
          action: "VENDOR_CREATED",
          entityType: "VENDOR",
          entityId: created.id,
          summary: `Vendor created: ${created.name}`,
          metadata: { phone: created.phone },
        });
        return created;
      }),
    pricingHistory: fleetOpsProcedure
      .input(
        z.object({
          vendorId: z.string().uuid(),
          partId: z.string().uuid().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        const vendor = await fleetDb.vendor.findFirst({
          where: { id: input.vendorId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vendor)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vendor not found in your organization.",
          });
        const [orders, receipts, parts] = await Promise.all([
          fleetDb.purchaseOrder.findMany({
            where: { orgId: ctx.fleetopsUser.orgId, vendorId: vendor.id },
            orderBy: { createdAt: "desc" },
          }),
          fleetDb.purchaseOrderReceipt.findMany({
            where: { orgId: ctx.fleetopsUser.orgId },
            orderBy: { receivedAt: "desc" },
          }),
          fleetDb.inventoryPart.findMany({
            where: { orgId: ctx.fleetopsUser.orgId },
          }),
        ]);
        const orderIds = new Set((orders as any[]).map(order => order.id));
        const partById = new Map((parts as any[]).map(part => [part.id, part]));
        const rows = (receipts as any[])
          .filter(
            receipt =>
              orderIds.has(receipt.purchaseOrderId) &&
              (!input.partId || receipt.partId === input.partId)
          )
          .map(receipt => ({
            ...receipt,
            vendorId: vendor.id,
            vendorName: vendor.name,
            part: partById.get(receipt.partId) ?? null,
          }));
        const suppliedParts = Array.from(
          new Map(
            rows.filter(row => row.part).map(row => [row.partId, row.part])
          ).values()
        );
        return {
          vendor,
          rows,
          suppliedParts,
          purchaseHistory: (orders as any[]).map(order => ({
            id: order.id,
            status: order.status,
            totalCost: order.totalCost,
            createdAt: order.createdAt,
          })),
          averageUnitCost: rows.length
            ? rows.reduce((total, row) => total + Number(row.unitCost), 0) /
              rows.length
            : null,
        };
      }),
  }),
  purchaseOrders: router({
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
      const [orders, vendors] = await Promise.all([
        fleetDb.purchaseOrder.findMany({
          where: { orgId: ctx.fleetopsUser.orgId },
          orderBy: { createdAt: "desc" },
        }),
        fleetDb.vendor.findMany({ where: { orgId: ctx.fleetopsUser.orgId } }),
      ]);
      const vendorById = new Map(
        vendors.map((vendor: any) => [vendor.id, vendor])
      );
      return orders.map((order: any) => ({
        ...order,
        vendor: vendorById.get(order.vendorId) ?? null,
      }));
    }),
    create: fleetOpsProcedure
      .input(
        z.object({
          vendorId: z.string().uuid(),
          totalCost: z.number().nonnegative(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const vendor = await fleetDb.vendor.findFirst({
          where: { id: input.vendorId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vendor)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vendor not found in your organization.",
          });
        const created = await fleetDb.purchaseOrder.create({
          data: {
            id: crypto.randomUUID(),
            ...input,
            status: "DRAFT",
            totalCost: input.totalCost,
            orgId: ctx.fleetopsUser.orgId,
            createdAt: new Date(),
          },
        });
        await recordAudit(ctx, {
          action: "PURCHASE_ORDER_CREATED",
          entityType: "PURCHASE_ORDER",
          entityId: created.id,
          summary: `Purchase order created: ₹${Number(created.totalCost).toLocaleString("en-IN")}`,
          metadata: { vendorId: created.vendorId },
        });
        return created;
      }),
    updateStatus: fleetOpsProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          status: z.enum([
            "DRAFT",
            "SENT",
            "APPROVED",
            "ORDERED",
            "PARTIALLY_RECEIVED",
            "RECEIVED",
            "CANCELLED",
            "CLOSED",
          ]),
          expectedUpdatedAt: z.coerce.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        if (
          input.status === "APPROVED" &&
          ctx.fleetopsUser.role !== "SUPERADMIN"
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only a Superadmin can approve a purchase order.",
          });
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.purchaseOrder.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Purchase order not found in your organization.",
          });
        if (
          input.expectedUpdatedAt &&
          new Date(order.updatedAt).getTime() !==
            input.expectedUpdatedAt.getTime()
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This purchase order changed elsewhere. Refresh before updating its status.",
          });
        const allowed: Record<string, string[]> = {
          DRAFT: ["SENT", "APPROVED", "CANCELLED"],
          SENT: [
            "APPROVED",
            "ORDERED",
            "PARTIALLY_RECEIVED",
            "RECEIVED",
            "CANCELLED",
          ],
          APPROVED: ["ORDERED", "CANCELLED"],
          ORDERED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
          PARTIALLY_RECEIVED: ["RECEIVED", "CANCELLED"],
          RECEIVED: ["CLOSED"],
          CLOSED: [],
          CANCELLED: [],
        };
        if (!allowed[order.status]?.includes(input.status))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot move purchase order from ${order.status} to ${input.status}.`,
          });
        const updated = await fleetDb.purchaseOrder.update({
          where: { id: order.id },
          data: {
            status: input.status,
            ...(input.status === "RECEIVED" ? { receivedAt: new Date() } : {}),
            ...(input.status === "CLOSED" ? { closedAt: new Date() } : {}),
          },
        });
        await recordAudit(ctx, {
          action: "PURCHASE_ORDER_STATUS_CHANGED",
          entityType: "PURCHASE_ORDER",
          entityId: order.id,
          summary: `Purchase order moved from ${order.status} to ${input.status}`,
          metadata: { previousStatus: order.status, nextStatus: input.status },
        });
        return updated;
      }),
    receivePartial: fleetOpsProcedure
      .input(
        z.object({
          purchaseOrderId: z.string().uuid(),
          partId: z.string().uuid(),
          quantity: z.number().int().positive(),
          damagedQuantity: z.number().int().nonnegative().default(0),
          backorderedQuantity: z.number().int().nonnegative().default(0),
          varianceReason: z.string().trim().min(3).max(300).optional(),
          expectedQuantityOnHand: z.number().int().nonnegative(),
          unitCost: z.number().nonnegative(),
          invoiceNumber: z.string().trim().max(120).optional(),
          location: z.string().trim().max(120).optional(),
          complete: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        if (
          (input.damagedQuantity > 0 || input.backorderedQuantity > 0) &&
          !input.varianceReason
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A variance reason is required for damaged or back-ordered quantities.",
          });
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const order = await fleetDb.purchaseOrder.findFirst({
          where: { id: input.purchaseOrderId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!order || ["CANCELLED", "CLOSED"].includes(order.status))
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Purchase order is not receivable in this organization.",
          });
        const vendor = await fleetDb.vendor.findFirst({
          where: { id: order.vendorId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!vendor)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Purchase order vendor is not in this organization.",
          });
        const part = await fleetDb.inventoryPart.findFirst({
          where: { id: input.partId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!part)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory part not found in this organization.",
          });
        const received = await fleetDb.$transaction(async (tx: any) => {
          const changed = await tx.inventoryPart.updateMany({
            where: {
              id: part.id,
              orgId: ctx.fleetopsUser.orgId,
              quantityOnHand: input.expectedQuantityOnHand,
            },
            data: {
              quantityOnHand: input.expectedQuantityOnHand + input.quantity,
              unitCost: input.unitCost,
              ...(input.location ? { binLocation: input.location } : {}),
            },
          });
          if (!changed.count)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Inventory changed since it was loaded. Refresh the balance and retry.",
            });
          const receipt = await tx.purchaseOrderReceipt.create({
            data: {
              id: crypto.randomUUID(),
              orgId: ctx.fleetopsUser.orgId,
              purchaseOrderId: order.id,
              partId: part.id,
              quantity: input.quantity,
              damagedQuantity: input.damagedQuantity,
              backorderedQuantity: input.backorderedQuantity,
              varianceReason: input.varianceReason,
              unitCost: input.unitCost,
              invoiceNumber: input.invoiceNumber,
              location: input.location,
              receivedById: ctx.fleetopsUser.id,
              receivedAt: new Date(),
            },
          });
          if (tx.inventoryMovement?.create)
            await tx.inventoryMovement.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                partId: part.id,
                actorId: ctx.fleetopsUser.id,
                movementType: "RECEIPT",
                quantity: input.quantity,
                unitCost: input.unitCost,
                reason: `Purchase order receipt ${order.id}`,
                createdAt: new Date(),
              },
            });
          const updatedOrder = await tx.purchaseOrder.update({
            where: { id: order.id },
            data: {
              status: input.complete ? "RECEIVED" : "PARTIALLY_RECEIVED",
              ...(input.invoiceNumber
                ? { supplierInvoiceNumber: input.invoiceNumber }
                : {}),
              ...(input.complete ? { receivedAt: new Date() } : {}),
            },
          });
          return { receipt, order: updatedOrder };
        });
        await recordAudit(ctx, {
          action: "PURCHASE_ORDER_PARTIALLY_RECEIVED",
          entityType: "PURCHASE_ORDER",
          entityId: order.id,
          summary: `Received ${input.quantity} units into ${part.name}`,
          metadata: {
            partId: part.id,
            quantity: input.quantity,
            damagedQuantity: input.damagedQuantity,
            backorderedQuantity: input.backorderedQuantity,
            varianceReason: input.varianceReason,
            unitCost: input.unitCost,
            invoiceNumber: input.invoiceNumber,
            location: input.location,
            complete: input.complete,
          },
        });
        return received;
      }),
    receipts: fleetOpsProcedure
      .input(z.object({ purchaseOrderId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "INVENTORY_MANAGER"]);
        const order = await fleetDb.purchaseOrder.findFirst({
          where: { id: input.purchaseOrderId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Purchase order not found in your organization.",
          });
        return fleetDb.purchaseOrderReceipt.findMany({
          where: { purchaseOrderId: order.id, orgId: ctx.fleetopsUser.orgId },
          orderBy: { receivedAt: "desc" },
        });
      }),
  }),
  compliance: router({
    summary: fleetOpsProcedure
      .input(
        z
          .object({
            expiryWindowDays: z.number().int().min(1).max(365).default(30),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        const windowDays = input?.expiryWindowDays ?? 30;
        const [vehicles, assignments, documents, users] = await Promise.all([
          fleetDb.vehicle.findMany({
            where: { orgId: ctx.fleetopsUser.orgId },
            orderBy: { licensePlate: "asc" },
          }),
          fleetDb.vehicleAssignment.findMany({
            where: { orgId: ctx.fleetopsUser.orgId, active: true },
          }),
          fleetDb.document.findMany({
            where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null },
          }),
          fleetDb.user.findMany({ where: { orgId: ctx.fleetopsUser.orgId } }),
        ]);
        const now = Date.now();
        const windowEnd = now + windowDays * 86_400_000;
        const documentsByVehicle = new Map<string, any[]>();
        for (const document of documents as any[]) {
          if (document.vehicleId)
            documentsByVehicle.set(document.vehicleId, [
              ...(documentsByVehicle.get(document.vehicleId) ?? []),
              document,
            ]);
        }
        const classify = (rows: any[]) => {
          if (!rows.length) return "MISSING";
          if (rows.some(row => new Date(row.expiryDate).getTime() < now))
            return "EXPIRED";
          if (rows.some(row => new Date(row.expiryDate).getTime() <= windowEnd))
            return "EXPIRING";
          return "VALID";
        };
        const vehicleRows = (vehicles as any[]).map(vehicle => ({
          vehicleId: vehicle.id,
          licensePlate: vehicle.licensePlate,
          status: classify(documentsByVehicle.get(vehicle.id) ?? []),
          documentCount: (documentsByVehicle.get(vehicle.id) ?? []).length,
        }));
        const userById = new Map((users as any[]).map(user => [user.id, user]));
        const driverRows = (assignments as any[])
          .filter(assignment => assignment.driverId)
          .map(assignment => {
            const vehicle = (vehicles as any[]).find(
              row => row.id === assignment.vehicleId
            );
            const status = classify(
              vehicle ? (documentsByVehicle.get(vehicle.id) ?? []) : []
            );
            const driver = userById.get(assignment.driverId);
            return {
              driverId: assignment.driverId,
              driverName:
                driver?.fullName ?? driver?.email ?? "Assigned driver",
              vehicleId: assignment.vehicleId,
              licensePlate: vehicle?.licensePlate ?? "Unassigned vehicle",
              status,
            };
          });
        const driverCounts = {
          VALID: driverRows.filter(row => row.status === "VALID").length,
          EXPIRING: driverRows.filter(row => row.status === "EXPIRING").length,
          EXPIRED: driverRows.filter(row => row.status === "EXPIRED").length,
          MISSING: driverRows.filter(row => row.status === "MISSING").length,
        };
        const counts = {
          VALID: vehicleRows.filter(row => row.status === "VALID").length,
          EXPIRING: vehicleRows.filter(row => row.status === "EXPIRING").length,
          EXPIRED: vehicleRows.filter(row => row.status === "EXPIRED").length,
          MISSING: vehicleRows.filter(row => row.status === "MISSING").length,
        };
        return {
          expiryWindowDays: windowDays,
          counts,
          vehicles: vehicleRows,
          drivers: driverRows,
          driverCounts,
        };
      }),
  }),
  documents: router({
    exportPdf: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const [documentRows, vehicles] = await Promise.all([
        fleetDb.document.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null },
          orderBy: { expiryDate: "asc" },
        }),
        fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } }),
      ]);
      const vehicleById = new Map(
        vehicles.map((vehicle: any) => [vehicle.id, vehicle])
      );
      const rows = documentRows.map((row: any) => ({
        ...row,
        vehicle: row.vehicleId
          ? (vehicleById.get(row.vehicleId) ?? null)
          : null,
      }));
      const content = simplePdf("VahanSync Compliance Register", [
        `Organization: ${ctx.fleetopsUser.org.name}`,
        `Generated: ${new Date().toLocaleDateString("en-IN")}`,
        `Documents: ${rows.length}`,
        ...rows.map(
          (row: any) =>
            `${row.title} | ${row.docType} | ${row.vehicle ? vehicleIdentity(row.vehicle) : "Organization"} | expires ${new Date(row.expiryDate).toLocaleDateString("en-IN")}`
        ),
      ]);
      await recordAudit(ctx, {
        action: "DOCUMENT_EXPORT_PDF",
        entityType: "DOCUMENT",
        summary: `Exported compliance PDF with ${rows.length} documents`,
        metadata: { count: rows.length },
      });
      return {
        filename: `vahansync-compliance-${new Date().toISOString().slice(0, 10)}.pdf`,
        content,
        rowCount: rows.length,
      };
    }),
    exportCsv: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const [documentRows, vehicles] = await Promise.all([
        fleetDb.document.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null },
          orderBy: { expiryDate: "asc" },
        }),
        fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } }),
      ]);
      const vehicleById = new Map(
        vehicles.map((vehicle: any) => [vehicle.id, vehicle])
      );
      const rows = documentRows.map((row: any) => ({
        ...row,
        vehicle: row.vehicleId
          ? (vehicleById.get(row.vehicleId) ?? null)
          : null,
      }));
      const csv = csvDocument(
        rows.map((row: any) => ({
          title: row.title,
          docType: row.docType,
          vehicle: row.vehicle ? vehicleIdentity(row.vehicle) : "Organization",
          expiryDate: new Date(row.expiryDate).toISOString().slice(0, 10),
          fileStatus: row.fileKey ? "STORED" : "MISSING",
        })),
        ["title", "docType", "vehicle", "expiryDate", "fileStatus"]
      );
      await recordAudit(ctx, {
        action: "DOCUMENT_EXPORT_CSV",
        entityType: "DOCUMENT",
        summary: `Exported ${rows.length} compliance documents`,
        metadata: { count: rows.length },
      });
      return {
        filename: `vahansync-compliance-${new Date().toISOString().slice(0, 10)}.csv`,
        content: csv,
        rowCount: rows.length,
      };
    }),
    previewImport: fleetOpsProcedure
      .input(z.object({ csv: z.string().max(1_000_000) }))
      .query(({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        const parsed = parseComplianceCsv(input.csv);
        return {
          rowCount: parsed.rows.length,
          validCount: parsed.rows.filter(row => !row.errors.length).length,
          errors: parsed.errors,
          rows: parsed.rows
            .slice(0, 100)
            .map(item => ({
              rowNumber: item.rowNumber,
              ...item.row,
              errors: item.errors,
            })),
        };
      }),
    importCsv: fleetOpsProcedure
      .input(z.object({ csv: z.string().max(1_000_000) }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const parsed = parseComplianceCsv(input.csv);
        if (parsed.errors.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: parsed.errors.slice(0, 8).join("; "),
          });
        const vehicles = await fleetDb.vehicle.findMany({
          where: { orgId: ctx.fleetopsUser.orgId },
        });
        const vehicleIds = new Set(vehicles.map((vehicle: any) => vehicle.id));
        const existing = await fleetDb.document.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null },
        });
        const seen = new Set(
          existing.map(
            (document: any) =>
              `${document.title}|${document.docType}|${document.vehicleId}|${new Date(document.expiryDate).toISOString().slice(0, 10)}`
          )
        );
        const candidates = parsed.rows
          .filter(item => vehicleIds.has(item.row.vehicleId))
          .filter(item => {
            const key = `${item.row.title}|${item.row.docType}|${item.row.vehicleId}|${item.row.expiryDate}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        if (candidates.length !== parsed.rows.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Every row must reference an organization vehicle and must not duplicate an existing compliance document.",
          });
        const created = await fleetDb.$transaction(async (tx: any) => {
          const rows: any[] = [];
          for (const item of candidates) {
            rows.push(
              await tx.document.create({
              data: {
                id: crypto.randomUUID(),
                orgId: ctx.fleetopsUser.orgId,
                title: item.row.title,
                docType: item.row.docType,
                expiryDate: new Date(item.row.expiryDate),
                vehicleId: item.row.vehicleId,
                fileUrl: item.row.fileUrl || undefined,
                createdAt: new Date(),
              },
              })
            );
          }
          return rows;
        });
        await recordAudit(ctx, {
          action: "DOCUMENT_IMPORT_CSV",
          entityType: "DOCUMENT",
          summary: `Imported ${created.length} compliance documents`,
          metadata: { count: created.length },
        });
        return { importedCount: created.length };
      }),
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
      const [documents, vehicles] = await Promise.all([
        fleetDb.document.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, archivedAt: null },
          orderBy: { expiryDate: "asc" },
        }),
        fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } }),
      ]);
      const vehicleById = new Map(
        vehicles.map((vehicle: any) => [vehicle.id, vehicle])
      );
      return documents.map((document: any) => ({
        ...document,
        vehicle: document.vehicleId
          ? (vehicleById.get(document.vehicleId) ?? null)
          : null,
      }));
    }),
    versions: fleetOpsProcedure
      .input(z.object({ documentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        const document = await fleetDb.document.findFirst({
          where: { id: input.documentId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!document)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Document not found in this organization.",
          });
        return fleetDb.documentVersion.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, documentId: document.id },
          orderBy: { versionNumber: "desc" },
          take: 50,
        });
      }),
    create: fleetOpsProcedure
      .input(
        z.object({
          title: z.string().min(2),
          docType: z.string().min(2),
          fileUrl: z.string().url().optional(),
          fileKey: z.string().optional(),
          fileData: z.string().max(4_000_000).optional(),
          fileContentType: z.string().optional(),
          expiryDate: z.coerce.date(),
          vehicleId: z.string().uuid().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const { fileData, fileContentType, ...data } = input;
        let fileUrl = data.fileUrl;
        let fileKey = data.fileKey;
        let fileChecksum: string | undefined;
        let fileSizeBytes: number | undefined;
        if (fileData) {
          const decoded = decodeDocumentUpload(fileData, fileContentType);
          const duplicate = await fleetDb.document.findFirst({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              fileChecksum: decoded.checksum,
            },
          });
          if (duplicate)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This exact document file already exists in the organization.",
            });
          const uploaded = await storagePut(
            `fleetops/documents/${ctx.fleetopsUser.orgId}/${input.title}`,
            decoded.bytes,
            fileContentType
          );
          fileUrl = uploaded.url;
          fileKey = uploaded.key;
          fileChecksum = decoded.checksum;
          fileSizeBytes = decoded.sizeBytes;
        }
        if (!fileUrl)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A document file is required.",
          });
        const created = await fleetDb.document.create({
          data: {
            id: crypto.randomUUID(),
            ...data,
            fileUrl,
            fileKey,
            fileChecksum,
            fileSizeBytes,
            retentionUntil: retentionAfterExpiry(input.expiryDate),
            orgId: ctx.fleetopsUser.orgId,
            createdAt: new Date(),
          },
        });
        await fleetDb.documentVersion.create({
          data: {
            id: crypto.randomUUID(),
            orgId: ctx.fleetopsUser.orgId,
            documentId: created.id,
            versionNumber: 1,
            title: created.title,
            docType: created.docType,
            fileUrl: created.fileUrl,
            fileKey: created.fileKey,
            fileChecksum: created.fileChecksum,
            fileSizeBytes: created.fileSizeBytes,
            expiryDate: created.expiryDate,
            createdById: ctx.fleetopsUser.id,
            createdAt: new Date(),
          },
        });
        await recordAudit(ctx, {
          action: "DOCUMENT_CREATED",
          entityType: "DOCUMENT",
          entityId: created.id,
          summary: `Compliance document added: ${created.title}`,
          metadata: {
            docType: created.docType,
            fileChecksum,
            fileSizeBytes,
            malwareScan: "NOT_AVAILABLE_POLICY_RECORDED",
          },
        });
        return created;
      }),
    update: fleetOpsProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          title: z.string().min(2).optional(),
          expiryDate: z.coerce.date().optional(),
          fileData: z.string().max(4_000_000).optional(),
          fileContentType: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const existing = await fleetDb.document.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Document not found.",
          });
        const { id, fileData, fileContentType, ...data } = input;
        let updateData: any = { ...data };
        if (fileData) {
          const decoded = decodeDocumentUpload(fileData, fileContentType);
          const duplicate = await fleetDb.document.findFirst({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              fileChecksum: decoded.checksum,
            },
          });
          if (duplicate && duplicate.id !== existing.id)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This exact replacement file already exists in the organization.",
            });
          const uploaded = await storagePut(
            `fleetops/documents/${ctx.fleetopsUser.orgId}/${existing.title}`,
            decoded.bytes,
            fileContentType
          );
          updateData = {
            ...updateData,
            fileUrl: uploaded.url,
            fileKey: uploaded.key,
            fileChecksum: decoded.checksum,
            fileSizeBytes: decoded.sizeBytes,
          };
        }
        if (input.expiryDate)
          updateData.retentionUntil = retentionAfterExpiry(input.expiryDate);
        const updated = await fleetDb.document.update({
          where: { id },
          data: updateData,
        });
        const versions = await fleetDb.documentVersion.findMany({
          where: { orgId: ctx.fleetopsUser.orgId, documentId: existing.id },
          orderBy: { versionNumber: "desc" },
          take: 1,
        });
        const nextVersion = Number(versions[0]?.versionNumber ?? 0) + 1;
        await fleetDb.documentVersion.create({
          data: {
            id: crypto.randomUUID(),
            orgId: ctx.fleetopsUser.orgId,
            documentId: updated.id,
            versionNumber: nextVersion,
            title: updated.title,
            docType: updated.docType,
            fileUrl: updated.fileUrl,
            fileKey: updated.fileKey,
            fileChecksum: updated.fileChecksum,
            fileSizeBytes: updated.fileSizeBytes,
            expiryDate: updated.expiryDate,
            createdById: ctx.fleetopsUser.id,
            createdAt: new Date(),
          },
        });
        await recordAudit(ctx, {
          action: "DOCUMENT_UPDATED",
          entityType: "DOCUMENT",
          entityId: existing.id,
          summary: `Compliance document updated: ${updated.title}`,
          metadata: {
            fileChecksum: updateData.fileChecksum,
            fileSizeBytes: updateData.fileSizeBytes,
            retentionUntil: updateData.retentionUntil,
          },
        });
        return updated;
      }),
    archive: fleetOpsProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          reason: z.string().trim().min(3).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        assertWritable(ctx.fleetopsUser.org);
        const document = await fleetDb.document.findFirst({
          where: {
            id: input.id,
            orgId: ctx.fleetopsUser.orgId,
            archivedAt: null,
          },
        });
        if (!document)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Active document not found.",
          });
        const archived = await fleetDb.document.update({
          where: { id: document.id },
          data: { archivedAt: new Date(), archivedById: ctx.fleetopsUser.id },
        });
        await recordAudit(ctx, {
          action: "DOCUMENT_ARCHIVED",
          entityType: "DOCUMENT",
          entityId: document.id,
          summary: `Archived compliance document: ${document.title}`,
          metadata: {
            reason: input.reason,
            retentionUntil: document.retentionUntil,
          },
        });
        return archived;
      }),
    lifecycle: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const rows = await fleetDb.document.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        orderBy: { createdAt: "desc" },
      });
      const now = Date.now();
      const missingMetadata = rows.filter(
        (row: any) => !row.fileKey || !row.fileChecksum || !row.fileSizeBytes
      );
      const retentionExpired = rows.filter(
        (row: any) =>
          row.retentionUntil && new Date(row.retentionUntil).getTime() < now
      );
      return {
        total: rows.length,
        missingMetadata: missingMetadata.map((row: any) => row.id),
        retentionExpired: retentionExpired.map((row: any) => row.id),
        malwareScanPolicy: "EXTERNAL_SCAN_REQUIRED_BEFORE_PRODUCTION_UPLOAD",
        accessLogging: "FILE_ACCESSED audit events enabled",
      };
    }),
    access: fleetOpsProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          kind: z.enum(["DOCUMENT", "WORK_ORDER_EVIDENCE"]).default("DOCUMENT"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(
          ctx.fleetopsUser.role,
          input.kind === "DOCUMENT"
            ? ["SUPERADMIN", "FLEET_MANAGER"]
            : ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN"]
        );
        const row =
          input.kind === "DOCUMENT"
            ? await fleetDb.document.findFirst({
                where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
              })
            : await fleetDb.workOrderEvidence.findFirst({
                where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
              });
        if (!row?.fileKey)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "The requested file is unavailable.",
          });
        await recordAudit(ctx, {
          action: "FILE_ACCESSED",
          entityType: input.kind,
          entityId: input.id,
          summary: `Authorized file access for ${input.kind.toLowerCase()}`,
        });
        return {
          url: await storageGetSignedUrl(row.fileKey),
          expiresInSeconds: 900,
        };
      }),
  }),
  reports: router({
    maintenancePerformance: fleetOpsProcedure
      .input(
        z
          .object({
            from: z.coerce.date().optional(),
            to: z.coerce.date().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, [
          "SUPERADMIN",
          "FLEET_MANAGER",
          "ACCOUNTANT",
        ]);
        const to = input?.to ?? new Date();
        const from = input?.from ?? new Date(to.getTime() - 90 * 86_400_000);
        if (from > to)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Report start date must be before end date.",
          });
        const orders = await fleetDb.workOrder.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            createdAt: { gte: from, lte: to },
          },
          include: { vehicle: true },
          orderBy: { createdAt: "asc" },
        });
        const completed = (orders as any[]).filter(order => order.completedAt);
        const durations = completed
          .map(order =>
            Math.max(
              0,
              new Date(order.completedAt).getTime() -
                new Date(order.startedAt ?? order.createdAt).getTime()
            )
          )
          .filter(value => Number.isFinite(value));
        const turnaroundHours = durations.length
          ? durations.reduce((sum, value) => sum + value, 0) /
            durations.length /
            3_600_000
          : 0;
        const downtimeHours = (orders as any[])
          .filter(order => !["COMPLETED", "CANCELLED"].includes(order.status))
          .reduce(
            (sum, order) =>
              sum +
              Math.max(
                0,
                Date.now() -
                  new Date(order.startedAt ?? order.createdAt).getTime()
              ) /
                3_600_000,
            0
          );
        const titleCounts = new Map<string, { title: string; count: number }>();
        for (const order of orders as any[]) {
          const key = String(order.title).trim().toLowerCase();
          const item = titleCounts.get(key) ?? { title: order.title, count: 0 };
          item.count += 1;
          titleCounts.set(key, item);
        }
        const repeatRepairs = Array.from(titleCounts.values())
          .filter(item => item.count > 1)
          .sort((a, b) => b.count - a.count);
        const vehicleCounts = new Map<
          string,
          { vehicleId: string; vehicle: string; repairs: number }
        >();
        for (const order of completed as any[]) {
          const item = vehicleCounts.get(order.vehicleId) ?? {
            vehicleId: order.vehicleId,
            vehicle: order.vehicle
              ? vehicleIdentity(order.vehicle)
              : order.vehicleId,
            repairs: 0,
          };
          item.repairs += 1;
          vehicleCounts.set(order.vehicleId, item);
        }
        return {
          from,
          to,
          totalWorkOrders: orders.length,
          completedWorkOrders: completed.length,
          openWorkOrders: orders.filter(
            (order: any) => !["COMPLETED", "CANCELLED"].includes(order.status)
          ).length,
          turnaroundHours: Number(turnaroundHours.toFixed(2)),
          downtimeHours: Number(downtimeHours.toFixed(2)),
          repeatRepairs,
          failurePatterns: repeatRepairs.slice(0, 10),
          vehicleRepairCounts: Array.from(vehicleCounts.values()).sort(
            (a, b) => b.repairs - a.repairs
          ),
        };
      }),
  }),
  financials: router({
    vehicles: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      return fleetDb.vehicle.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        select: {
          id: true,
          vin: true,
          licensePlate: true,
          make: true,
          model: true,
          currentOdometer: true,
        },
        orderBy: { licensePlate: "asc" },
      });
    }),
    exportPdf: fleetOpsProcedure
      .input(
        z
          .object({
            vehicleId: z.string().uuid().optional(),
            type: z.enum(["REVENUE", "EXPENSE"]).optional(),
            category: z.string().optional(),
            from: z.coerce.date().optional(),
            to: z.coerce.date().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
        const where = {
          orgId: ctx.fleetopsUser.orgId,
          ...(input?.vehicleId ? { vehicleId: input.vehicleId } : {}),
          ...(input?.type ? { type: input.type } : {}),
          ...(input?.category ? { category: input.category } : {}),
          ...(input?.from ? { transactionDate: { gte: input.from } } : {}),
          ...(input?.to ? { transactionDate: { lte: input.to } } : {}),
        };
        const [recordRows, vehicles] = await Promise.all([
          fleetDb.financialRecord.findMany({
            where,
            orderBy: { transactionDate: "desc" },
          }),
          fleetDb.vehicle.findMany({
            where: { orgId: ctx.fleetopsUser.orgId },
          }),
        ]);
        const vehicleById = new Map(
          vehicles.map((vehicle: any) => [vehicle.id, vehicle])
        );
        const rows = recordRows.map((row: any) => ({
          ...row,
          vehicle: row.vehicleId
            ? (vehicleById.get(row.vehicleId) ?? null)
            : null,
        }));
        const content = simplePdf("VahanSync INR Financial Ledger", [
          `Organization: ${ctx.fleetopsUser.org.name}`,
          `Generated: ${new Date().toLocaleDateString("en-IN")}`,
          `Records: ${rows.length}`,
          ...rows.map(
            (row: any) =>
              `${new Date(row.transactionDate).toLocaleDateString("en-IN")} | ${row.vehicle ? vehicleIdentity(row.vehicle) : row.vehicleId} | ${row.type} | ${row.category} | INR ${Number(row.amount).toFixed(2)}`
          ),
        ]);
        await recordAudit(ctx, {
          action: "FINANCIAL_EXPORT_PDF",
          entityType: "FINANCIAL_RECORD",
          summary: `Exported financial PDF with ${rows.length} records`,
          metadata: { count: rows.length },
        });
        return {
          filename: `vahansync-financial-ledger-${new Date().toISOString().slice(0, 10)}.pdf`,
          content,
          rowCount: rows.length,
        };
      }),
    exportCsv: fleetOpsProcedure
      .input(
        z
          .object({
            vehicleId: z.string().uuid().optional(),
            type: z.enum(["REVENUE", "EXPENSE"]).optional(),
            category: z.string().optional(),
            from: z.coerce.date().optional(),
            to: z.coerce.date().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
        const where = {
          orgId: ctx.fleetopsUser.orgId,
          ...(input?.vehicleId ? { vehicleId: input.vehicleId } : {}),
          ...(input?.type ? { type: input.type } : {}),
          ...(input?.category ? { category: input.category } : {}),
          ...(input?.from ? { transactionDate: { gte: input.from } } : {}),
          ...(input?.to ? { transactionDate: { lte: input.to } } : {}),
        };
        const [recordRows, vehicles] = await Promise.all([
          fleetDb.financialRecord.findMany({
            where,
            orderBy: { transactionDate: "desc" },
          }),
          fleetDb.vehicle.findMany({
            where: { orgId: ctx.fleetopsUser.orgId },
          }),
        ]);
        const vehicleById = new Map(
          vehicles.map((vehicle: any) => [vehicle.id, vehicle])
        );
        const rows = recordRows.map((row: any) => ({
          ...row,
          vehicle: row.vehicleId
            ? (vehicleById.get(row.vehicleId) ?? null)
            : null,
        }));
        const csv = csvDocument(
          rows.map((row: any) => ({
            transactionDate: new Date(row.transactionDate)
              .toISOString()
              .slice(0, 10),
            vehicle: row.vehicle ? vehicleIdentity(row.vehicle) : row.vehicleId,
            type: row.type,
            category: row.category,
            amountInr: Number(row.amount).toFixed(2),
          })),
          ["transactionDate", "vehicle", "type", "category", "amountInr"]
        );
        await recordAudit(ctx, {
          action: "FINANCIAL_EXPORT_CSV",
          entityType: "FINANCIAL_RECORD",
          summary: `Exported ${rows.length} financial records`,
          metadata: { count: rows.length },
        });
        return {
          filename: `vahansync-financial-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
          content: csv,
          rowCount: rows.length,
        };
      }),
    list: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      const [records, vehicles] = await Promise.all([
        fleetDb.financialRecord.findMany({
          where: { orgId: ctx.fleetopsUser.orgId },
          orderBy: { transactionDate: "desc" },
        }),
        fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } }),
      ]);
      const vehicleById = new Map(
        vehicles.map((vehicle: any) => [vehicle.id, vehicle])
      );
      return records.map((record: any) => ({
        ...record,
        vehicle: record.vehicleId
          ? (vehicleById.get(record.vehicleId) ?? null)
          : null,
      }));
    }),
    metrics: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      const vehicles = await fleetDb.vehicle.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
      });
      const vehicleIds = vehicles.map((vehicle: any) => vehicle.id);
      const [records, odometers] = await Promise.all([
        fleetDb.financialRecord.findMany({
          where: { orgId: ctx.fleetopsUser.orgId },
          orderBy: { transactionDate: "desc" },
        }),
        vehicleIds.length
          ? fleetDb.odometerLog.findMany({
              where: { vehicleId: { in: vehicleIds } },
              orderBy: { createdAt: "asc" },
            })
          : Promise.resolve([]),
      ]);
      const byVehicle = new Map<
        string,
        {
          vehicleId: string;
          vehicle: string;
          revenue: number;
          expenses: number;
          firstOdometer: number | null;
          lastOdometer: number | null;
        }
      >();
      const expenseBreakdown = new Map<string, number>();
      for (const vehicle of vehicles as any[])
        byVehicle.set(vehicle.id, {
          vehicleId: vehicle.id,
          vehicle: vehicleIdentity(vehicle),
          revenue: 0,
          expenses: 0,
          firstOdometer: null,
          lastOdometer: null,
        });
      for (const record of records as any[]) {
        const row = byVehicle.get(record.vehicleId);
        if (!row) continue;
        const amount = Number(record.amount);
        if (record.type === "REVENUE") row.revenue += amount;
        else {
          row.expenses += amount;
          const category = String(record.category || "OTHER_EXPENSE");
          expenseBreakdown.set(
            category,
            (expenseBreakdown.get(category) ?? 0) + amount
          );
        }
      }
      for (const log of odometers as any[]) {
        const row = byVehicle.get(log.vehicleId);
        if (!row) continue;
        const reading = Number(log.reading);
        if (row.firstOdometer === null) row.firstOdometer = reading;
        row.lastOdometer = reading;
      }
      const rows = Array.from(byVehicle.values()).map(row => {
        const distanceKm =
          row.firstOdometer !== null && row.lastOdometer !== null
            ? Math.max(0, row.lastOdometer - row.firstOdometer)
            : 0;
        return {
          ...row,
          distanceKm,
          profit: row.revenue - row.expenses,
          cpk: distanceKm > 0 ? row.expenses / distanceKm : 0,
        };
      });
      return {
        rows,
        totals: {
          revenue: rows.reduce((s, r) => s + r.revenue, 0),
          expenses: rows.reduce((s, r) => s + r.expenses, 0),
          profit: rows.reduce((s, r) => s + r.profit, 0),
          cpk:
            rows.reduce((s, r) => s + r.expenses, 0) /
            Math.max(
              1,
              rows.reduce((s, r) => s + r.distanceKm, 0)
            ),
        },
        expenseBreakdown: Array.from(expenseBreakdown.entries())
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount),
      };
    }),
    reconcile: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
      const [vehicles, fuelLogs, ledger] = await Promise.all([
        fleetDb.vehicle.findMany({
          where: { orgId: ctx.fleetopsUser.orgId },
          orderBy: { licensePlate: "asc" },
        }),
        fleetDb.fuelLog.findMany({ where: { orgId: ctx.fleetopsUser.orgId } }),
        fleetDb.financialRecord.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            type: "EXPENSE",
            category: "FUEL",
          },
        }),
      ]);
      const fuelByVehicle = new Map<string, number>();
      const ledgerByVehicle = new Map<string, number>();
      for (const row of fuelLogs as any[])
        fuelByVehicle.set(
          row.vehicleId,
          (fuelByVehicle.get(row.vehicleId) ?? 0) + Number(row.amount)
        );
      for (const row of ledger as any[])
        ledgerByVehicle.set(
          row.vehicleId,
          (ledgerByVehicle.get(row.vehicleId) ?? 0) + Number(row.amount)
        );
      const rows = (vehicles as any[]).map(vehicle => {
        const fuelLogged = fuelByVehicle.get(vehicle.id) ?? 0;
        const ledgerFuel = ledgerByVehicle.get(vehicle.id) ?? 0;
        const difference = Math.round((fuelLogged - ledgerFuel) * 100) / 100;
        return {
          vehicleId: vehicle.id,
          vehicle: vehicleIdentity(vehicle),
          fuelLogged,
          ledgerFuel,
          difference,
          status: Math.abs(difference) < 0.01 ? "MATCHED" : "MISMATCH",
        };
      });
      return {
        rows,
        mismatches: rows.filter(row => row.status === "MISMATCH"),
        totals: {
          fuelLogged: rows.reduce((sum, row) => sum + row.fuelLogged, 0),
          ledgerFuel: rows.reduce((sum, row) => sum + row.ledgerFuel, 0),
          difference: rows.reduce((sum, row) => sum + row.difference, 0),
        },
      };
    }),
    create: fleetOpsProcedure
      .input(
        z.object({
          vehicleId: z.string().uuid(),
          type: z.enum(["REVENUE", "EXPENSE"]),
          category: z.string().min(2),
          amount: z.number().nonnegative(),
          transactionDate: z.coerce.date(),
          taxAmount: z.number().nonnegative().default(0),
          gstin: z.string().trim().max(30).optional(),
          taxCategory: z.string().trim().max(80).optional(),
          invoiceNumber: z.string().trim().max(120).optional(),
          vendor: z.string().trim().max(160).optional(),
          paymentMethod: z.string().trim().max(60).optional(),
          costCenterType: z.string().trim().max(60).optional(),
          costCenterId: z.string().uuid().optional(),
          tdsAmount: z.number().nonnegative().default(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
        assertWritable(ctx.fleetopsUser.org);
        const approvalStatus =
          input.type === "EXPENSE" &&
          (input.amount >= 100000 ||
            input.category.toUpperCase().includes("MANUAL"))
            ? "PENDING_APPROVAL"
            : "APPROVED";
        const created = await fleetDb.financialRecord.create({
          data: {
            id: crypto.randomUUID(),
            ...input,
            amount: input.amount,
            orgId: ctx.fleetopsUser.orgId,
            approvalStatus,
          },
        });
        await recordAudit(ctx, {
          action:
            approvalStatus === "PENDING_APPROVAL"
              ? "FINANCIAL_APPROVAL_REQUIRED"
              : "FINANCIAL_RECORD_CREATED",
          entityType: "FINANCIAL_RECORD",
          entityId: created.id,
          summary: `${created.type} record added: ₹${Number(created.amount).toLocaleString("en-IN")}${approvalStatus === "PENDING_APPROVAL" ? " · approval required" : ""}`,
          metadata: { category: created.category, approvalStatus },
        });
        return created;
      }),
    approvalQueue: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const [records, vehicles] = await Promise.all([
        fleetDb.financialRecord.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            approvalStatus: "PENDING_APPROVAL",
          },
          orderBy: { transactionDate: "asc" },
        }),
        fleetDb.vehicle.findMany({ where: { orgId: ctx.fleetopsUser.orgId } }),
      ]);
      const vehicleById = new Map(
        vehicles.map((vehicle: any) => [vehicle.id, vehicle])
      );
      return records.map((record: any) => ({
        ...record,
        vehicle: record.vehicleId
          ? (vehicleById.get(record.vehicleId) ?? null)
          : null,
      }));
    }),
    reconcileRecord: fleetOpsProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          reconciliationRef: z.string().trim().min(2).max(160),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
        assertWritable(ctx.fleetopsUser.org);
        const existing = await fleetDb.financialRecord.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Financial record not found.",
          });
        const updated = await fleetDb.financialRecord.update({
          where: { id: existing.id },
          data: {
            reconciledAt: new Date(),
            reconciliationRef: input.reconciliationRef,
          },
        });
        await recordAudit(ctx, {
          action: "FINANCIAL_RECORD_RECONCILED",
          entityType: "FINANCIAL_RECORD",
          entityId: existing.id,
          summary: `Reconciled financial record ₹${Number(existing.amount).toLocaleString("en-IN")}`,
          metadata: { reconciliationRef: input.reconciliationRef },
        });
        return updated;
      }),
    approve: fleetOpsProcedure
      .input(z.object({ id: z.string().uuid(), reason: z.string().min(3) }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        assertWritable(ctx.fleetopsUser.org);
        const existing = await fleetDb.financialRecord.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Financial record not found.",
          });
        if (existing.approvalStatus !== "PENDING_APPROVAL")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This financial record does not require approval.",
          });
        const approved = await fleetDb.financialRecord.update({
          where: { id: existing.id },
          data: {
            approvalStatus: "APPROVED",
            approvedById: ctx.fleetopsUser.id,
            approvalReason: input.reason,
          },
        });
        await recordAudit(ctx, {
          action: "FINANCIAL_RECORD_APPROVED",
          entityType: "FINANCIAL_RECORD",
          entityId: existing.id,
          summary: `Approved financial record ₹${Number(existing.amount).toLocaleString("en-IN")}`,
          metadata: { reason: input.reason },
        });
        return approved;
      }),
    reverse: fleetOpsProcedure
      .input(z.object({ id: z.string().uuid(), reason: z.string().min(3) }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "ACCOUNTANT"]);
        assertWritable(ctx.fleetopsUser.org);
        const existing = await fleetDb.financialRecord.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Financial record not found.",
          });
        const priorReversal = await fleetDb.financialRecord.findFirst({
          where: { orgId: ctx.fleetopsUser.orgId, reversalOfId: existing.id },
        });
        if (priorReversal)
          throw new TRPCError({
            code: "CONFLICT",
            message: "This financial record has already been reversed.",
          });
        const reversal = await fleetDb.financialRecord.create({
          data: {
            id: crypto.randomUUID(),
            orgId: ctx.fleetopsUser.orgId,
            vehicleId: existing.vehicleId,
            type: existing.type === "EXPENSE" ? "REVENUE" : "EXPENSE",
            category: `REVERSAL:${existing.category}`,
            amount: Number(existing.amount),
            transactionDate: new Date(),
            approvalStatus:
              existing.approvalStatus === "APPROVED"
                ? "APPROVED"
                : "PENDING_APPROVAL",
            reversalOfId: existing.id,
            approvalReason: input.reason,
          },
        });
        await recordAudit(ctx, {
          action: "FINANCIAL_RECORD_REVERSED",
          entityType: "FINANCIAL_RECORD",
          entityId: existing.id,
          summary: `Reversed financial record ₹${Number(existing.amount).toLocaleString("en-IN")}`,
          metadata: { reversalId: reversal.id, reason: input.reason },
        });
        return reversal;
      }),
  }),
  billing: router({
    plans: publicProcedure.query(() => {
      const plansData = Object.values(BILLING_PLANS).map(plan => ({
        ...plan,
        platformFeeInr: plan.platformFeePaise / 100,
        overageVehicleFeeInr: plan.overageVehicleFeePaise / 100,
      }));
      console.log("DEBUG: billing.plans returning:", plansData);
      return plansData;
    }),
    status: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const isTrial = ctx.fleetopsUser.org.subscriptionTier === "TRIAL_FREE";
      const plan =
        BILLING_PLANS[
          normalizePlan(
            isTrial ? "STARTER" : ctx.fleetopsUser.org.subscriptionTier
          )
        ];
      const activeVehicles = await fleetDb.vehicle.count({
        where: { orgId: ctx.fleetopsUser.orgId },
      });
      const bill = calculateMonthlyBill(plan.id, activeVehicles);
      const persistedBillingStatus = (
        ctx.fleetopsUser.org as { billingStatus?: string | null }
      ).billingStatus;
      const lifecycle = isTrial
        ? billingLifecycle(ctx.fleetopsUser.org.trialEndsAt)
        : (persistedBillingStatus ?? "ACTIVE");
      return {
        tier: ctx.fleetopsUser.org.subscriptionTier,
        planName: plan.name,
        planDescription: plan.description,
        isTrial,
        trialEndsAt: ctx.fleetopsUser.org.trialEndsAt,
        daysRemaining: isTrial
          ? Math.max(
              0,
              Math.ceil(
                (ctx.fleetopsUser.org.trialEndsAt.getTime() - Date.now()) /
                  86_400_000
              )
            )
          : 0,
        maxVehicles: plan.includedVehicles,
        maxUsers: plan.maxUsers,
        activeVehicles,
        overageVehicles: bill.overageVehicles,
        platformFeePaise: bill.platformFeePaise,
        overagePaise: bill.overagePaise,
        estimatedSubtotalPaise: bill.subtotalPaise,
        lifecycle,
        currency: "INR",
        billingReady: false,
        writeLocked: lifecycle === "SUSPENDED",
      };
    }),
    invoices: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      return fleetDb.billingInvoice.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        orderBy: { createdAt: "desc" },
        take: 12,
      });
    }),
    payments: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      return fleetDb.billingPayment.findMany({
        where: { orgId: ctx.fleetopsUser.orgId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    }),
    generateInvoice: fleetOpsProcedure.mutation(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const now = new Date();
      const periodStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      );
      const periodEnd = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          0,
          23,
          59,
          59,
          999
        )
      );
      const plan =
        BILLING_PLANS[
          normalizePlan(
            ctx.fleetopsUser.org.subscriptionTier === "TRIAL_FREE"
              ? "STARTER"
              : ctx.fleetopsUser.org.subscriptionTier
          )
        ];
      const activeVehicles = await fleetDb.vehicle.count({
        where: { orgId: ctx.fleetopsUser.orgId },
      });
      const bill = calculateMonthlyBill(plan.id, activeVehicles);
      const existing = await fleetDb.billingInvoice.findFirst({
        where: {
          orgId: ctx.fleetopsUser.orgId,
          billingPeriodStart: periodStart,
        },
      });
      if (existing) return existing;
      const invoice = await fleetDb.billingInvoice.create({
        data: {
          id: crypto.randomUUID(),
          orgId: ctx.fleetopsUser.orgId,
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          plan: plan.id,
          billableVehicles: bill.billableVehicles,
          includedVehicles: plan.includedVehicles,
          overageVehicles: bill.overageVehicles,
          platformFeePaise: bill.platformFeePaise,
          overagePaise: bill.overagePaise,
          usageAddonsPaise: bill.usageAddonsPaise,
          creditsPaise: bill.creditsPaise,
          subtotalPaise: bill.subtotalPaise,
          taxPaise: 0,
          totalPaise: bill.subtotalPaise,
          status: "DRAFT",
          createdAt: now,
        },
      });
      await recordAudit(ctx, {
        action: "BILLING_INVOICE_SNAPSHOT_CREATED",
        entityType: "BILLING_INVOICE",
        entityId: invoice.id,
        summary: `Created ${plan.name} invoice snapshot`,
        metadata: {
          billableVehicles: bill.billableVehicles,
          subtotalPaise: bill.subtotalPaise,
          billingPeriodStart: periodStart.toISOString(),
        },
      });
      return invoice;
    }),
    createTestOrder: fleetOpsProcedure
      .input(z.object({ invoiceId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        const invoice = await fleetDb.billingInvoice.findFirst({
          where: { id: input.invoiceId, orgId: ctx.fleetopsUser.orgId },
        });
        if (!invoice)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invoice not found in this organization",
          });
        const { keyId } = assertRazorpayTestMode();
        const order = await createRazorpayTestOrder({
          amountPaise: Number(invoice.totalPaise),
          receipt: invoice.id,
          notes: {
            orgId: ctx.fleetopsUser.orgId,
            invoiceId: invoice.id,
            mode: "TEST",
          },
        });
        await recordAudit(ctx, {
          action: "BILLING_TEST_ORDER_CREATED",
          entityType: "BILLING_INVOICE",
          entityId: invoice.id,
          summary: "Created Razorpay Test Mode order",
          metadata: {
            orderId: order.id,
            amountPaise: order.amount,
            mode: "TEST",
          },
        });
        return { keyId, order };
      }),
  }),
  billingTest: router({
    checkPlanEligibility: fleetOpsProcedure
      .input(
        z.object({ plan: z.enum(["STARTER", "GROWTH", "SCALE", "ENTERPRISE"]) })
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
        const activeVehicles = await fleetDb.vehicle.count({
          where: { orgId: ctx.fleetopsUser.orgId },
        });
        const eligibility = validatePlanEligibility(input.plan, activeVehicles);
        const planConfig = BILLING_PLANS[input.plan];
        return {
          plan: input.plan,
          activeVehicles,
          eligible: eligibility.eligible,
          reason: eligibility.reason,
          minVehicles: planConfig.minVehicles,
          maxVehicles: planConfig.maxVehicles,
        };
      }),
    activateStarter: fleetOpsProcedure.mutation(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, ["SUPERADMIN"]);
      const { keyId } = assertRazorpayTestMode();
      const plan = BILLING_PLANS.STARTER;
      if (ctx.fleetopsUser.org.subscriptionTier !== "TRIAL_FREE") {
        return {
          activated: false,
          alreadyActive: true,
          tier: ctx.fleetopsUser.org.subscriptionTier,
          maxVehicles: ctx.fleetopsUser.org.maxVehicles,
        };
      }
      const activeVehicles = await fleetDb.vehicle.count({
        where: { orgId: ctx.fleetopsUser.orgId },
      });
      const eligibility = validatePlanEligibility(plan.id, activeVehicles);
      if (!eligibility.eligible) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            eligibility.reason ??
            "This plan is not eligible for your organization.",
        });
      }
      const now = new Date();
      const renewalAt = new Date(now);
      renewalAt.setUTCMonth(renewalAt.getUTCMonth() + 1);
      const organization = await fleetDb.organization.update({
        where: { id: ctx.fleetopsUser.orgId },
        data: {
          subscriptionTier: plan.id,
          maxVehicles: plan.includedVehicles,
          maxUsers: plan.maxUsers,
          billingStatus: "ACTIVE",
          subscriptionStartedAt: now,
          renewalAt,
          paymentFailedAt: null,
          suspendedAt: null,
        },
      });
      await recordAudit(ctx, {
        action: "BILLING_TEST_PLAN_ACTIVATED",
        entityType: "ORGANIZATION",
        entityId: organization.id,
        summary: "Activated Starter plan in Razorpay Test Mode",
        metadata: {
          tier: plan.id,
          maxVehicles: plan.includedVehicles,
          maxUsers: plan.maxUsers,
          razorpayMode: "TEST",
          keyPrefix: keyId.slice(0, 9),
          activeVehicles,
        },
      });
      return {
        activated: true,
        alreadyActive: false,
        tier: plan.id,
        maxVehicles: plan.includedVehicles,
        maxUsers: plan.maxUsers,
        renewalAt,
      };
    }),
  }),
  activity: router({
    recent: fleetOpsProcedure.query(async ({ ctx }) => {
      requireRole(ctx.fleetopsUser.role, [
        "SUPERADMIN",
        "FLEET_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
        "DRIVER",
      ]);
      const [orders, alerts, odometers] = await Promise.all([
        fleetDb.workOrder.findMany({
          where: ["MECHANIC", "TECHNICIAN"].includes(ctx.fleetopsUser.role)
            ? {
                orgId: ctx.fleetopsUser.orgId,
                assignedMechanicId: ctx.fleetopsUser.id,
              }
            : { orgId: ctx.fleetopsUser.orgId },
          include: { vehicle: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        fleetDb.notification.findMany({
          where: {
            orgId: ctx.fleetopsUser.orgId,
            recipientId: ctx.fleetopsUser.id,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        fleetDb.odometerLog.findMany({
          where:
            ctx.fleetopsUser.role === "DRIVER"
              ? {
                  vehicle: { orgId: ctx.fleetopsUser.orgId },
                  driverId: ctx.fleetopsUser.id,
                }
              : { vehicle: { orgId: ctx.fleetopsUser.orgId } },
          include: { vehicle: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);
      return [
        ...orders.map((order: any) => ({
          id: order.id,
          kind: "work_order",
          title: order.title,
          detail: `${order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId} · ${order.status}`,
          createdAt: order.createdAt,
        })),
        ...alerts.map((alert: any) => ({
          id: alert.id,
          kind: "notification",
          title: alert.title,
          detail: alert.message,
          createdAt: alert.createdAt,
        })),
        ...odometers.map((log: any) => ({
          id: log.id,
          kind: "odometer",
          title: `Odometer updated · ${log.vehicle ? vehicleIdentity(log.vehicle) : log.vehicleId}`,
          detail: `${Number(log.reading).toLocaleString("en-IN")} km${log.isFlagged ? " · flagged" : ""}`,
          createdAt: log.createdAt,
        })),
      ]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 20);
    }),
  }),
  notifications: router({
    list: fleetOpsProcedure
      .input(
        z
          .object({
            severity: z
              .enum(["ALL", "INFO", "HIGH", "CRITICAL"])
              .default("ALL"),
            sourceType: z.string().trim().max(80).default("ALL"),
            status: z
              .enum(["ALL", "UNREAD", "READ", "OPEN", "RESOLVED"])
              .default("ALL"),
            vehicleId: z.string().uuid().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const filters = input ?? {
          severity: "ALL",
          sourceType: "ALL",
          status: "ALL",
        };
        const where: any = {
          orgId: ctx.fleetopsUser.orgId,
          recipientId: ctx.fleetopsUser.id,
          ...(filters.severity !== "ALL" ? { severity: filters.severity } : {}),
          ...(filters.sourceType !== "ALL"
            ? { sourceType: filters.sourceType }
            : {}),
          ...(filters.status === "UNREAD"
            ? { isRead: false }
            : filters.status === "READ"
              ? { isRead: true }
              : filters.status === "OPEN"
                ? { resolvedAt: null }
                : filters.status === "RESOLVED"
                  ? { resolvedAt: { not: null } }
                  : {}),
        };
        const notifications = await fleetDb.notification.findMany({
          where,
          orderBy: { resolvedAt: "asc", createdAt: "desc" },
          take: 100,
        });
        if (!filters.vehicleId) return notifications;
        const [vehicles, orders, issues] = await Promise.all([
          fleetDb.vehicle.findMany({
            where: { orgId: ctx.fleetopsUser.orgId, id: filters.vehicleId },
            select: { id: true },
          }),
          fleetDb.workOrder.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              vehicleId: filters.vehicleId,
            },
            select: { id: true },
          }),
          fleetDb.vehicleIssue.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              vehicleId: filters.vehicleId,
            },
            select: { id: true },
          }),
        ]);
        const references = new Set([
          filters.vehicleId,
          ...vehicles.map((row: any) => row.id),
          ...orders.map((row: any) => row.id),
          ...issues.map((row: any) => row.id),
        ]);
        return (notifications as any[]).filter(
          notification =>
            notification.referenceId && references.has(notification.referenceId)
        );
      }),
    sourceDetail: fleetOpsProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const notification = await fleetDb.notification.findFirst({
          where: {
            id: input.id,
            orgId: ctx.fleetopsUser.orgId,
            recipientId: ctx.fleetopsUser.id,
          },
        });
        if (!notification)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notification is outside your organization scope.",
          });
        const sourceType = String(notification.sourceType ?? "SYSTEM");
        const source =
          notification.referenceId && sourceType === "WORK_ORDER"
            ? await fleetDb.workOrder.findFirst({
                where: {
                  id: notification.referenceId,
                  orgId: ctx.fleetopsUser.orgId,
                },
                include: { vehicle: true, assignedMechanic: true },
              })
            : notification.referenceId && sourceType === "VEHICLE_ISSUE"
              ? await fleetDb.vehicleIssue.findFirst({
                  where: {
                    id: notification.referenceId,
                    orgId: ctx.fleetopsUser.orgId,
                  },
                  include: { vehicle: true },
                })
              : notification.referenceId && sourceType === "VEHICLE"
                ? await fleetDb.vehicle.findFirst({
                    where: {
                      id: notification.referenceId,
                      orgId: ctx.fleetopsUser.orgId,
                    },
                  })
                : notification.referenceId && sourceType === "DOCUMENT_EXPIRY"
                  ? await fleetDb.document.findFirst({
                      where: {
                        id: notification.referenceId,
                        orgId: ctx.fleetopsUser.orgId,
                      },
                      include: { vehicle: true },
                    })
                  : notification.referenceId && sourceType === "INVENTORY_LOW"
                    ? await fleetDb.inventoryPart.findFirst({
                        where: {
                          id: notification.referenceId,
                          orgId: ctx.fleetopsUser.orgId,
                        },
                      })
                    : null;
        return { notification, sourceType, source };
      }),
    markRead: fleetOpsProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) =>
        fleetDb.notification.updateMany({
          where: {
            id: input.id,
            orgId: ctx.fleetopsUser.orgId,
            recipientId: ctx.fleetopsUser.id,
          },
          data: { isRead: true, acknowledgedAt: new Date() },
        })
      ),
    escalate: fleetOpsProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        const current = await fleetDb.notification.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notification not found.",
          });
        if (current.resolvedAt)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Resolved notifications cannot be escalated.",
          });
        const updated = await fleetDb.notification.update({
          where: { id: current.id },
          data: {
            escalationLevel: (current.escalationLevel ?? 0) + 1,
            isRead: false,
          },
        });
        try {
          const managers = await fleetDb.user.findMany({
            where: {
              orgId: ctx.fleetopsUser.orgId,
              role: { in: ["FLEET_MANAGER", "SUPERADMIN"] },
            },
          });
          if (managers.length > 1) {
            const otherManagers = managers.filter(
              (manager: any) => manager.id !== ctx.fleetopsUser.id
            );
            if (otherManagers.length > 0) {
              const escalationNotifications = otherManagers.map(
                (manager: any) => ({
                  id: crypto.randomUUID(),
                  orgId: ctx.fleetopsUser.orgId,
                  recipientId: manager.id,
                  title: `Escalation alert: ${current.title}`,
                  message: `Notification escalated by ${ctx.fleetopsUser.fullName} to level ${updated.escalationLevel}`,
                  type: "ALERT_ESCALATION",
                  severity: "CRITICAL",
                  sourceType: "ALERT_ESCALATION",
                  referenceId: current.referenceId,
                  isRead: false,
                  createdAt: new Date(),
                })
              );
              await fleetDb.notification.createMany({
                data: escalationNotifications,
              });
            }
          }
        } catch (error) {
          console.error("Failed to send escalation alerts:", error);
        }
        await recordAudit(ctx, {
          action: "NOTIFICATION_ESCALATED",
          entityType: "NOTIFICATION",
          entityId: current.id,
          summary: `Escalated ${current.title}`,
          metadata: {
            escalationLevel: updated.escalationLevel,
            sourceType: current.sourceType,
            escalatedBy: ctx.fleetopsUser.fullName,
          },
        });
        return updated;
      }),
    resolve: fleetOpsProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          note: z.string().trim().min(3).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.fleetopsUser.role, ["SUPERADMIN", "FLEET_MANAGER"]);
        const current = await fleetDb.notification.findFirst({
          where: { id: input.id, orgId: ctx.fleetopsUser.orgId },
        });
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notification not found.",
          });
        if (current.resolvedAt) return current;
        if (current.sourceType === "VEHICLE_ISSUE" && current.referenceId) {
          const issue = await fleetDb.vehicleIssue.findFirst({
            where: { id: current.referenceId, orgId: ctx.fleetopsUser.orgId },
          });
          if (!issue || !["RESOLVED", "CLOSED"].includes(issue.status))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Resolve the source vehicle issue before closing this notification.",
            });
        }
        if (current.sourceType === "WORK_ORDER" && current.referenceId) {
          const order = await fleetDb.workOrder.findFirst({
            where: { id: current.referenceId, orgId: ctx.fleetopsUser.orgId },
          });
          if (!order || order.status !== "COMPLETED")
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Complete the source work order before closing this notification.",
            });
        }
        if (current.sourceType === "VEHICLE" && current.referenceId) {
          const vehicle = await fleetDb.vehicle.findFirst({
            where: { id: current.referenceId, orgId: ctx.fleetopsUser.orgId },
          });
          if (!vehicle || vehicle.status !== "ACTIVE")
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Clear the source vehicle before closing this notification.",
            });
        }
        const updated = await fleetDb.notification.update({
          where: { id: current.id },
          data: {
            isRead: true,
            acknowledgedAt: current.acknowledgedAt ?? new Date(),
            resolvedAt: new Date(),
          },
        });
        await recordAudit(ctx, {
          action: "NOTIFICATION_RESOLVED",
          entityType: "NOTIFICATION",
          entityId: current.id,
          summary: `Resolved ${current.title}`,
          metadata: {
            note: input.note,
            sourceType: current.sourceType,
            referenceId: current.referenceId,
          },
        });
        return updated;
      }),
  }),
});

export type AppRouter = typeof appRouter;
