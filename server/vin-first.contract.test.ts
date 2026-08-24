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
});
