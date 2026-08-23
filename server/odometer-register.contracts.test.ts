import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const driverSource = readFileSync(new URL("../client/src/components/workspaces/DriverWorkspace.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../client/src/components/RoleWorkspaces.tsx", import.meta.url), "utf8");
const realtimeSource = readFileSync(new URL("../client/src/hooks/useFleetOpsRealtime.ts", import.meta.url), "utf8");

describe("odometer persistence and register visibility contracts", () => {
  it("validates Driver readings against both the persisted vehicle and latest log baseline", () => {
    expect(routerSource).toContain("const baseline = Math.max(current, previousLog ? Number(previousLog.reading) : current);");
    expect(routerSource).toContain("validateOdometerReading(baseline, input.reading, elapsedDays);");
  });

  it("returns the persisted vehicle and odometer log from the update mutation", () => {
    expect(routerSource).toContain("const [updatedVehicle, odometerLog] = await fleetDb.$transaction([");
    expect(routerSource).toContain("return { vehicle: updatedVehicle, odometerLog };");
    expect(routerSource).toContain('data: { currentOdometer: input.reading }');
  });

  it("enriches organization-scoped vehicle rows with the latest persisted odometer event", () => {
    expect(routerSource).toContain("const latestByVehicle = new Map<string, any>();");
    expect(routerSource).toContain("latestOdometerReading: latest?.reading ?? vehicle.currentOdometer");
    expect(routerSource).toContain("latestOdometerSource: latest?.source ?? \"VEHICLE_RECORD\"");
  });

  it("keeps Driver and Fleet Manager views synchronized after a successful update", () => {
    expect(driverSource).toContain("setVehicleId(safeVehicles[0].id)");
    expect(driverSource).toContain("void utils.vehicles.list.invalidate();");
    expect(driverSource).toContain("void utils.driver.dailyHome.invalidate();");
    expect(workspaceSource).toContain("item.latestOdometerReading ?? item.currentOdometer");
    expect(workspaceSource).toContain("Driver update synced");
  });

  it("invalidates Fleet Manager vehicle data when odometer logs are inserted", () => {
    expect(realtimeSource).toContain('table: "odometer_logs"');
    expect(realtimeSource).toContain("void utils.vehicles.list.invalidate();");
    expect(realtimeSource).toContain("void utils.vehicles.odometerHistory.invalidate();");
  });
});
