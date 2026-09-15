import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";
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
  storageCleanupJob: "storage_cleanup_jobs",
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
  storageCleanupJob: fleetopsSchema.storageCleanupJobs,
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
function identifier(name: string) {
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeName || safeName !== name) throw new Error("Invalid SQL identifier");
  return sql.identifier(safeName);
}
function normalize(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}
function condition(field: string, value: unknown): SQL {
  const c = identifier(field);
  if (value === null) return sql`${c} IS NULL`;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as AnyRecord;
    if (o.in !== undefined) {
      if (!Array.isArray(o.in))
        throw new Error("'in' operator requires an array");
      if (o.in.length === 0) return sql.raw("FALSE");
      if (!o.in.every(v => v === null || typeof v !== "object"))
        throw new Error("Invalid value type in 'in' operator");
      return sql`${c} IN (${sql.join(
        o.in.map((v: unknown) => sql`${normalize(v)}`),
        sql`, `
      )})`;
    }
    if (o.notIn !== undefined) {
      if (!Array.isArray(o.notIn))
        throw new Error("'notIn' operator requires an array");
      if (o.notIn.length === 0) return sql.raw("TRUE");
      if (!o.notIn.every(v => v === null || typeof v !== "object"))
        throw new Error("Invalid value type in 'notIn' operator");
      return sql`${c} NOT IN (${sql.join(
        o.notIn.map((v: unknown) => sql`${normalize(v)}`),
        sql`, `
      )})`;
    }
    if (o.contains !== undefined) {
      if (typeof o.contains !== "string" && typeof o.contains !== "number")
        throw new Error("'contains' requires string or number");
      const escaped = String(o.contains).replace(/[%_\\]/g, "\\$&");
      return sql`${c} ILIKE ${`%${escaped}%`} ESCAPE ${"\\"}`;
    }
    if (o.gt !== undefined) return sql`${c} > ${normalize(o.gt)}`;
    if (o.gte !== undefined) return sql`${c} >= ${normalize(o.gte)}`;
    if (o.lt !== undefined) return sql`${c} < ${normalize(o.lt)}`;
    if (o.lte !== undefined) return sql`${c} <= ${normalize(o.lte)}`;
  }
  return sql`${c} = ${normalize(value)}`;
}
function whereClause(where: AnyRecord = {}): SQL {
  const parts: SQL[] = [];
  for (const [field, value] of Object.entries(where)) {
    if (field === "vehicle" && value?.orgId)
      parts.push(
        sql`${identifier("vehicleId")} IN (SELECT ${identifier("id")} FROM ${identifier("vehicles")} WHERE ${identifier("orgId")} = ${value.orgId})`
      );
    else if (field === "org" && value?.id)
      parts.push(sql`${identifier("orgId")} = ${value.id}`);
    else if (field !== "vehicle" && field !== "org")
      parts.push(condition(field, value));
  }
  return parts.length
    ? sql` WHERE ${sql.join(parts, sql` AND `)}`
    : sql.empty();
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
function requireColumns(operation: string, columns: string[]) {
  if (columns.length === 0)
    throw new Error(`${operation} requires at least one column`);
}
function requireWhereId(operation: string, where: AnyRecord = {}) {
  if (where.id === undefined || where.id === null)
    throw new Error(`${operation} requires an id`);
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
type SqlExecutor = Pick<typeof db, "execute">;

function model(modelName: string, executor: SqlExecutor = db) {
  const table = tables[modelName];
  if (!table) throw new Error(`Unknown database model: ${modelName}`);
  return {
    async findMany(options: QueryOptions = {}) {
      const select = options.select
        ? sql.join(Object.keys(options.select).map(identifier), sql`, `)
        : sql.raw("*");
      const order = options.orderBy
        ? Object.entries(options.orderBy)
            .map(([k, v]) => {
              const direction =
                String(v).toUpperCase() === "DESC" ? "DESC" : "ASC";
              return sql`${identifier(k)} ${sql.raw(direction)}`;
            })
            .reduce(
              (items, item) =>
                items.length ? [...items, sql`, `, item] : [item],
              [] as SQL[]
            )
        : undefined;
      const limit = options.take
        ? sql` LIMIT ${Math.max(1, Math.floor(Number(options.take)))}`
        : sql.empty();
      const result = await executor.execute(
        sql`SELECT ${select} FROM ${identifier(table)}${whereClause(options.where)}${
          order ? sql` ORDER BY ${sql.join(order, sql.empty())}` : sql.empty()
        }${limit}`
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
        sql`SELECT COUNT(*)::int AS count FROM ${identifier(table)}${whereClause(options.where)}`
      );
      return Number((result.rows[0] as AnyRecord)?.count ?? 0);
    },
    async create(options: QueryOptions) {
      const data = { ...(options.data ?? {}) };
      const keys = dataColumns(data);
      requireColumns("create", keys);
      const result = await executor.execute(
        sql`INSERT INTO ${identifier(table)} (${sql.join(
          keys.map(identifier),
          sql`, `
        )}) VALUES (${sql.join(
          keys.map(k => sql`${normalize(data[k])}`),
          sql`, `
        )}) RETURNING *`
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
      requireWhereId("update", options.where);
      const columns = dataColumns(data);
      requireColumns("update", columns);
      const set = columns
        .map(k => {
          const v = data[k];
          return v && typeof v === "object" && v.decrement !== undefined
            ? sql`${identifier(k)} = ${identifier(k)} - ${Number(v.decrement)}`
            : v && typeof v === "object" && v.increment !== undefined
              ? sql`${identifier(k)} = ${identifier(k)} + ${Number(v.increment)}`
              : sql`${identifier(k)} = ${normalize(v)}`;
        })
        .reduce(
          (items, item) => (items.length ? [...items, sql`, `, item] : [item]),
          [] as SQL[]
        );
      const auditSuffix = auditedTables.has(table)
        ? sql`, ${identifier("updatedAt")} = NOW()`
        : sql.empty();
      const result = await executor.execute(
        sql`UPDATE ${identifier(table)} SET ${sql.join(
          set,
          sql.empty()
        )}${auditSuffix} WHERE ${identifier("id")} = ${options.where.id} RETURNING *`
      );
      return result.rows[0] as AnyRecord;
    },
    async updateMany(options: QueryOptions) {
      const data = options.data ?? {};
      if (!options.where || Object.keys(options.where).length === 0)
        throw new Error("updateMany requires a where clause");
      const columns = dataColumns(data);
      requireColumns("updateMany", columns);
      const set = columns
        .map(k => {
          const v = data[k];
          return v && typeof v === "object" && v.decrement !== undefined
            ? sql`${identifier(k)} = ${identifier(k)} - ${Number(v.decrement)}`
            : v && typeof v === "object" && v.increment !== undefined
              ? sql`${identifier(k)} = ${identifier(k)} + ${Number(v.increment)}`
              : sql`${identifier(k)} = ${normalize(v)}`;
        })
        .reduce(
          (items, item) => (items.length ? [...items, sql`, `, item] : [item]),
          [] as SQL[]
        );
      const result = await executor.execute(
        sql`UPDATE ${identifier(table)} SET ${sql.join(
          set,
          sql.empty()
        )}${whereClause(options.where)}`
      );
      return { count: result.rowCount ?? 0 };
    },
    async delete(options: QueryOptions) {
      requireWhereId("delete", options.where);
      const result = await executor.execute(
        sql`DELETE FROM ${identifier(table)} WHERE ${identifier("id")} = ${options.where.id} RETURNING *`
      );
      return result.rows[0] as AnyRecord;
    },
    async aggregate(options: QueryOptions = {}) {
      const sumField = options._sum ? Object.keys(options._sum)[0] : "amount";
      const result = await executor.execute(
        sql`SELECT COALESCE(SUM(${identifier(sumField)}), 0) AS sum FROM ${identifier(table)}${whereClause(options.where)}`
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
export async function transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
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
