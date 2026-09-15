import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routerSource = readFileSync(
  new URL("./routers.ts", import.meta.url),
  "utf8"
);
const driverSource = readFileSync(
  new URL(
    "../client/src/components/workspaces/DriverWorkspace.tsx",
    import.meta.url
  ),
  "utf8"
);
const activeRegisterSource = readFileSync(
  new URL(
    "../client/src/components/workspaces/VehicleRegisterWorkspace.tsx",
    import.meta.url
  ),
  "utf8"
);
const activeOverviewSource = readFileSync(
  new URL(
    "../client/src/components/workspaces/FleetManagerOverviewWorkspace.tsx",
    import.meta.url
  ),
  "utf8"
);
const workspaceSource = readFileSync(
  new URL("../client/src/components/RoleWorkspaces.tsx", import.meta.url),
  "utf8"
);
const realtimeSource = readFileSync(
  new URL("../client/src/hooks/useFleetOpsRealtime.ts", import.meta.url),
  "utf8"
);

describe("odometer persistence and register visibility contracts", () => {
  it("validates Driver readings against both the persisted vehicle and latest log baseline", () => {
    expect(routerSource).toMatch(
      /const baseline = Math\.max\(\s*current,\s*previousLog \? Number\(previousLog\.reading\) : current\s*\)/
    );
    expect(routerSource).toContain(
      "validateOdometerReading(baseline, input.reading, elapsedDays);"
    );
  });

  it("returns the persisted vehicle and odometer log from the update mutation", () => {
    expect(routerSource).toContain(
      "const result = await fleetDb.$transaction("
    );
    expect(routerSource).toContain(
      'const { vehicle: updatedVehicle, odometerLog } = result;'
    );
    expect(routerSource).toContain(
      "return { vehicle: updatedVehicle, odometerLog };"
    );
    expect(routerSource).toContain("data: { currentOdometer: input.reading }");
  });

  it("enriches organization-scoped vehicle rows with the latest persisted odometer event", () => {
    expect(routerSource).toContain(
      "const latestByVehicle = new Map<string, any>();"
    );
    expect(routerSource).toContain(
      "latestOdometerReading: latest?.reading ?? vehicle.currentOdometer"
    );
    expect(routerSource).toContain(
      'latestOdometerSource: latest?.source ?? "VEHICLE_RECORD"'
    );
  });

  it("keeps Driver and Fleet Manager views synchronized after a successful update", () => {
    expect(driverSource).toContain("setVehicleId(safeVehicles[0].id)");
    expect(driverSource).toContain("utils.vehicles.list.invalidate()");
    expect(driverSource).toContain("utils.driver.dailyHome.invalidate()");
    expect(driverSource).toContain("await Promise.all");
    expect(workspaceSource).toContain(
      "item.latestOdometerReading ?? item.currentOdometer"
    );
    expect(workspaceSource).toContain("Driver update synced");
    expect(activeRegisterSource).toContain(
      "vehicle.latestOdometerReading ?? vehicle.currentOdometer"
    );
    expect(activeOverviewSource).toContain(
      "vehicle?.latestOdometerReading ?? vehicle?.currentOdometer"
    );
  });

  it("does not generate invalid SQL for an unassigned Driver filter", () => {
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(dbSource).toContain(
      'if (o.in.length === 0) return sql.raw("FALSE")'
    );
  });

  it("invalidates Fleet Manager vehicle data when odometer logs are inserted", () => {
    expect(realtimeSource).toContain('table: "odometer_logs"');
    expect(realtimeSource).toContain("void utils.vehicles.list.invalidate();");
    expect(realtimeSource).toContain(
      "void utils.vehicles.odometerHistory.invalidate();"
    );
  });
});
