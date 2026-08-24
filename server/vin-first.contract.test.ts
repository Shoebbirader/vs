import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { vehicleIdentity } from "./vehicle-identity";

describe("VIN-first vehicle identity", () => {
  it("shows VIN before registration with a safe fallback", () => {
    expect(vehicleIdentity({ vin: "mahb123", licensePlate: "MH12AB1234" })).toBe("VIN MAHB123 · Reg MH12AB1234");
    expect(vehicleIdentity({ licensePlate: "MH12AB1234" })).toBe("Reg MH12AB1234");
  });

  it("keeps the richer vehicle and component lifecycle fields in the active schema", () => {
    const schema = readFileSync(resolve(process.cwd(), "drizzle/fleetops-schema.ts"), "utf8");
    for (const field of ["chassisNumber", "engineNumber", "vehicleType", "assignedRoute", "depotLocation", "componentType", "componentSubtype", "installationDate", "expectedLifeDays", "alertThresholdDays", "inventoryPartId", "serialNumber"]) expect(schema).toContain(field);
  });

  it("uses VIN-first identity in planner, handoff, alert, and Fleet Manager signal labels", () => {
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const workspace = readFileSync(resolve(process.cwd(), "client/src/components/RoleWorkspaces.tsx"), "utf8");
    expect(router).toContain("vehicleLabel: vehicleIdentity(vehicle)");
    expect(router).toContain("vehicle: order.vehicle ? vehicleIdentity(order.vehicle) : order.vehicleId");
    expect(router).toContain("repair is ready for approval");
    expect(workspace).toContain("vehicleRow ? formatVehicleIdentity(vehicleRow) : item.vehicleId");
  });
});
