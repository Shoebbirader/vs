import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as fleetopsSchema from "../drizzle/fleetops-schema";

const globalForDb = globalThis as unknown as {
  fleetopsPool?: Pool;
  fleetopsDb?: ReturnType<typeof drizzle>;
};
const pool =
  globalForDb.fleetopsPool ??
  new Pool({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    max: 5,
    ssl: { rejectUnauthorized: process.env.NODE_ENV === "production" },
  });
if (process.env.NODE_ENV !== "production") globalForDb.fleetopsPool = pool;
export const db = globalForDb.fleetopsDb ?? drizzle(pool);
if (process.env.NODE_ENV !== "production") globalForDb.fleetopsDb = db;

// FIX: Properly close database pool on process termination to prevent leaks
if (typeof process !== "undefined" && process.on) {
  const gracefulShutdown = async () => {
    try {
      if (pool && !pool.ending) {
        console.log("[DB] Closing connection pool...");
        await pool.end();
        console.log("[DB] Connection pool closed");
      }
    } catch (error) {
      console.error("[DB] Error closing pool:", error);
    }
    process.exit(0);
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
}

const tables: Record<string, string> = {
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
  billingPayment: "billing_payments",
};
const drizzleTables: Record<string, unknown> = {
  organization: fleetopsSchema.organizations,
  organizationSetting: fleetopsSchema.organizationSettings,
  user: fleetopsSchema.users,
  invitation: fleetopsSchema.invitations,
  vehicle: fleetopsSchema.vehicles,
  vehicleAssignment: fleetopsSchema.vehicleAssignments,
  component: fleetopsSchema.components,
  odometerLog: fleetopsSchema.odometerLogs,
  workOrder: fleetopsSchema.workOrders,
  inventoryPart: fleetopsSchema.inventoryParts,
  workOrderPart: fleetopsSchema.workOrderParts,
  vendor: fleetopsSchema.vendors,
  purchaseOrder: fleetopsSchema.purchaseOrders,
  purchaseOrderReceipt: fleetopsSchema.purchaseOrderReceipts,
  financialRecord: fleetopsSchema.financialRecords,
  document: fleetopsSchema.documents,
  documentVersion: fleetopsSchema.documentVersions,
  notification: fleetopsSchema.notifications,
  notificationDelivery: fleetopsSchema.notificationDeliveries,
  workOrderEvidence: fleetopsSchema.workOrderEvidence,
  vehicleIssue: fleetopsSchema.vehicleIssues,
  dvirInspection: fleetopsSchema.dvirInspections,
  fuelLog: fleetopsSchema.fuelLogs,
  auditEvent: fleetopsSchema.auditEvents,
  inventoryMovement: fleetopsSchema.inventoryMovements,
  billingInvoice: fleetopsSchema.billingInvoices,
  billingPayment: fleetopsSchema.billingPayments,
};

type AnyRecord = Record<string, any>;
type QueryOptions = AnyRecord;
function quote(name: string) {
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeName) throw new Error("Invalid SQL identifier");
  return `"${safeName}"`;
}
function normalize(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}
function condition(field: string, value: unknown): string {
  const c = quote(field);
  if (value === null) return `${c} IS NULL`;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as AnyRecord;
    // SECURITY FIX: Validate input types before SQL injection
    if (o.in !== undefined) {
      if (!Array.isArray(o.in))
        throw new Error("'in' operator requires an array");
      if (o.in.length === 0) return "FALSE";
      // Validate all values are primitives
      if (!o.in.every(v => v === null || typeof v !== "object"))
        throw new Error("Invalid value type in 'in' operator");
      return `${c} IN (${o.in.map((v: unknown) => `'${String(v).replaceAll("'", "''")}'`).join(",")})`;
    }
    if (o.notIn !== undefined) {
      if (!Array.isArray(o.notIn))
        throw new Error("'notIn' operator requires an array");
      if (o.notIn.length === 0) return "TRUE";
      if (!o.notIn.every(v => v === null || typeof v !== "object"))
        throw new Error("Invalid value type in 'notIn' operator");
      return `${c} NOT IN (${o.notIn.map((v: unknown) => `'${String(v).replaceAll("'", "''")}'`).join(",")})`;
    }
    if (o.contains !== undefined) {
      if (typeof o.contains !== "string" && typeof o.contains !== "number")
        throw new Error("'contains' requires string or number");
      const escaped = String(o.contains).replace(/[%_\\]/g, "\\$&"); // Escape LIKE wildcards
      return `${c} ILIKE '%${escaped.replaceAll("'", "''")}%'`;
    }
    if (o.gt !== undefined)
      return `${c} > '${String(normalize(o.gt)).replaceAll("'", "''")}'`;
    if (o.gte !== undefined)
      return `${c} >= '${String(normalize(o.gte)).replaceAll("'", "''")}'`;
    if (o.lt !== undefined)
      return `${c} < '${String(normalize(o.lt)).replaceAll("'", "''")}'`;
    if (o.lte !== undefined)
      return `${c} <= '${String(normalize(o.lte)).replaceAll("'", "''")}'`;
  }
  if (typeof value === "boolean") return `${c} = ${value}`;
  if (typeof value === "number") return `${c} = ${value}`;
  return `${c} = '${String(normalize(value)).replaceAll("'", "''")}'`;
}
function whereClause(where: AnyRecord = {}) {
  const parts: string[] = [];
  for (const [field, value] of Object.entries(where)) {
    if (field === "vehicle" && value?.orgId)
      parts.push(
        `"vehicleId" IN (SELECT "id" FROM "vehicles" WHERE "orgId" = '${String(value.orgId).replaceAll("'", "''")}')`
      );
    else if (field === "org" && value?.id)
      parts.push(`"orgId" = '${String(value.id).replaceAll("'", "''")}'`);
    else if (field !== "vehicle" && field !== "org")
      parts.push(condition(field, value));
  }
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}
function dataColumns(data: AnyRecord) {
  return Object.keys(data).filter(
    key =>
      ![
        "vehicle",
        "org",
        "components",
        "workOrders",
        "assignedMechanic",
        "partsUsed",
      ].includes(key)
  );
}
const auditedTables = new Set([
  "organizations",
  "users",
  "vehicles",
  "vehicle_assignments",
  "odometer_logs",
  "vendors",
  "purchase_orders",
  "notifications",
  "dvir_inspections",
  "fuel_logs",
]);
function valueSql(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  return `'${String(normalize(value)).replaceAll("'", "''")}'`;
}

type SqlExecutor = Pick<typeof db, "execute">;

function model(modelName: string, executor: SqlExecutor = db) {
  const table = tables[modelName];
  if (!table) throw new Error(`Unknown database model: ${modelName}`);
  return {
    async findMany(options: QueryOptions = {}) {
      const select = options.select
        ? Object.keys(options.select).map(quote).join(", ")
        : "*";
      const order = options.orderBy
        ? Object.entries(options.orderBy)
            .map(
              ([k, v]) =>
                `${quote(k)} ${String(v).toUpperCase() === "DESC" ? "DESC" : "ASC"}`
            )
            .join(", ")
        : undefined;
      const limit = options.take
        ? ` LIMIT ${Math.max(1, Math.floor(Number(options.take)))}`
        : "";
      const result = await executor.execute(
        sql.raw(
          `SELECT ${select} FROM ${quote(table)}${whereClause(options.where)}${order ? ` ORDER BY ${order}` : ""}${limit}`
        )
      );
      return result.rows as AnyRecord[];
    },
    async findFirst(options: QueryOptions = {}) {
      const rows = await this.findMany({ ...options, take: 1 });
      return rows[0];
    },
    async findUnique(options: QueryOptions = {}) {
      return this.findFirst(options);
    },
    async count(options: QueryOptions = {}) {
      const result = await executor.execute(
        sql.raw(
          `SELECT COUNT(*)::int AS count FROM ${quote(table)}${whereClause(options.where)}`
        )
      );
      return Number((result.rows[0] as AnyRecord)?.count ?? 0);
    },
    async create(options: QueryOptions) {
      const data = { ...(options.data ?? {}) };
      const keys = dataColumns(data);
      const result = await executor.execute(
        sql.raw(
          `INSERT INTO ${quote(table)} (${keys.map(quote).join(", ")}) VALUES (${keys.map(k => valueSql(data[k])).join(", ")}) RETURNING *`
        )
      );
      return result.rows[0] as AnyRecord;
    },
    async createMany(options: QueryOptions) {
      const rows = (options.data ?? []) as AnyRecord[];
      for (const row of rows) await this.create({ data: row });
      return { count: rows.length };
    },
    async update(options: QueryOptions) {
      const data = options.data ?? {};
      const set = dataColumns(data)
        .map(k => {
          const v = data[k];
          return v && typeof v === "object" && v.decrement !== undefined
            ? `${quote(k)} = ${quote(k)} - ${Number(v.decrement)}`
            : v && typeof v === "object" && v.increment !== undefined
              ? `${quote(k)} = ${quote(k)} + ${Number(v.increment)}`
              : `${quote(k)} = ${valueSql(v)}`;
        })
        .join(", ");
      const auditSuffix = auditedTables.has(table)
        ? ', "updatedAt" = NOW()'
        : "";
      const result = await executor.execute(
        sql.raw(
          `UPDATE ${quote(table)} SET ${set}${auditSuffix} WHERE "id" = '${String(options.where.id).replaceAll("'", "''")}' RETURNING *`
        )
      );
      return result.rows[0] as AnyRecord;
    },
    async updateMany(options: QueryOptions) {
      const data = options.data ?? {};
      const set = dataColumns(data)
        .map(k => {
          const v = data[k];
          return v && typeof v === "object" && v.decrement !== undefined
            ? `${quote(k)} = ${quote(k)} - ${Number(v.decrement)}`
            : v && typeof v === "object" && v.increment !== undefined
              ? `${quote(k)} = ${quote(k)} + ${Number(v.increment)}`
              : `${quote(k)} = ${valueSql(v)}`;
        })
        .join(", ");
      const result = await executor.execute(
        sql.raw(
          `UPDATE ${quote(table)} SET ${set}${whereClause(options.where)}`
        )
      );
      return { count: result.rowCount ?? 0 };
    },
    async delete(options: QueryOptions) {
      const result = await executor.execute(
        sql.raw(
          `DELETE FROM ${quote(table)} WHERE "id" = '${String(options.where.id).replaceAll("'", "''")}' RETURNING *`
        )
      );
      return result.rows[0] as AnyRecord;
    },
    async aggregate(options: QueryOptions = {}) {
      const sumField = options._sum ? Object.keys(options._sum)[0] : "amount";
      const result = await executor.execute(
        sql.raw(
          `SELECT COALESCE(SUM(${quote(sumField)}), 0) AS sum FROM ${quote(table)}${whereClause(options.where)}`
        )
      );
      return { _sum: { [sumField]: (result.rows[0] as AnyRecord)?.sum ?? 0 } };
    },
    async upsert(options: QueryOptions) {
      const existing = await this.findFirst({ where: options.where });
      if (existing)
        return this.update({
          where: { id: existing.id },
          data: options.update,
        });
      return this.create({ data: options.create });
    },
  };
}

function createFleetDb(executor: SqlExecutor = db) {
  return new Proxy(
    {},
    {
      get: (_target, property) =>
        property === "$transaction"
          ? transaction
          : model(String(property), executor),
    }
  ) as any;
}

export const fleetDb = createFleetDb();
export async function transaction<T>(
  fn: (tx: any) => Promise<T>
): Promise<T> {
  return db.transaction(async tx => fn(createFleetDb(tx)));
}

export async function getUserByOpenId(openId: string) {
  return fleetDb.user.findFirst({ where: { authUserId: openId } });
}

export async function upsertUser(user: {
  openId: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  loginMethod?: string | null;
  lastSignedIn?: Date;
}) {
  const existing = await getUserByOpenId(user.openId);
  if (existing)
    return fleetDb.user.update({
      where: { id: existing.id },
      data: {
        email: user.email ?? existing.email,
        fullName: user.name ?? existing.fullName,
        role: user.role ?? existing.role,
      },
    });
  return undefined;
}
