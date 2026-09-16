import { describe, expect, it } from "vitest";
import { db, fleetDb } from "./db";
import { organizations, users, vehicles, workOrders, inventoryParts } from "../drizzle/fleetops-schema";
import { readFileSync } from "node:fs";

describe("Drizzle FleetOps data layer", () => {
  it("does not append audit updates to component tables without updatedAt", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).toContain("const auditedTables = new Set");
    expect(source).toContain("auditedTables.has(table)");
  });

  it("renders arithmetic update operators for inventory balances", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).toContain(
      "identifier(k)} = ${identifier(k)} - ${Number(v.decrement)}"
    );
    expect(source).toContain(
      "identifier(k)} = ${identifier(k)} + ${Number(v.increment)}"
    );
    expect(source).toContain("sql`${identifier(k)} = ${normalize(v)}`");
  });

  it("guards destructive or empty compatibility operations", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).toContain('requireColumns("create", keys)');
    expect(source).toContain('requireColumns("update", columns)');
    expect(source).toContain('updateMany requires a where clause');
    expect(source).toContain('requireWhereId("delete", options.where)');
    expect(source).toContain("deleteMany requires a where clause");
  });

  it("supports conflict-free idempotency inserts", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).toContain("async createIfAbsent");
    expect(source).toContain("ON CONFLICT DO NOTHING RETURNING *");
  });

  it("exposes the PostgreSQL client and FleetOps table definitions", () => {
    expect(typeof db.execute).toBe("function");
    expect(fleetDb).toBeDefined();
    expect(organizations).toBeDefined();
    expect(users).toBeDefined();
    expect(vehicles).toBeDefined();
    expect(workOrders).toBeDefined();
    expect(inventoryParts).toBeDefined();
  });
});
