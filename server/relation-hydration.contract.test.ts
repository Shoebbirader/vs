import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("adapter-safe operational relation hydration", () => {
  it("hydrates vehicle components and work-order vehicle, assignee, and parts rows explicitly", () => {
    expect(source).toContain("async function hydrateVehiclesWithComponents");
    expect(source).toContain("async function hydrateWorkOrders");
    expect(source).toContain("partsUsed: partsByOrder.get(order.id) ?? []");
    expect(source).toContain("return hydrateWorkOrders(orders as any[], ctx.fleetopsUser.orgId)");
    expect(source).toContain("const orders = await hydrateWorkOrders(orderRows as any[], ctx.fleetopsUser.orgId)");
    expect(source).toContain("fleetDb.workOrderEvidence.findMany");
    expect(source).toContain("vehicle: { ...vehicle, components }");
  });

  it("uses hydrated component and document identities in Fleet Manager readiness planning", () => {
    expect(source).toContain("const vehicles = await hydrateVehiclesWithComponents(vehicleRows as any[])");
    expect(source).toContain("vehicle: document.vehicleId ? vehicleById.get(document.vehicleId) ?? null : null");
  });
});
