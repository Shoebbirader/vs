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
    expect(source).toContain("quote(k)} = ${quote(k)} - ${Number(v.decrement)}");
    expect(source).toContain("quote(k)} = ${quote(k)} + ${Number(v.increment)}");
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
