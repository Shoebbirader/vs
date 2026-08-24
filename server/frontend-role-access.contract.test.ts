import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const homeSource = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
const vehicleRegisterSource = readFileSync(new URL("../client/src/components/workspaces/VehicleRegisterWorkspace.tsx", import.meta.url), "utf8");

describe("frontend role access contracts", () => {
  it("gates shared activity and inventory requests to the permitted role sets", () => {
    expect(homeSource).toContain('const canReadInventory = ["SUPERADMIN", "INVENTORY_MANAGER"].includes(backendRole);');
    expect(homeSource).toContain('const canReadActivity = ["SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "DRIVER"].includes(backendRole);');
    expect(homeSource).toContain('enabled: operationalEnabled && canReadInventory');
    expect(homeSource).toContain('enabled: operationalEnabled && canReadActivity');
  });

  it("uses the Fleet Manager-authorized operational roster for driver handoff", () => {
    expect(vehicleRegisterSource).toContain("trpc.team.operationalRoster.useQuery");
    expect(vehicleRegisterSource).not.toContain("trpc.team.members.useQuery");
    expect(vehicleRegisterSource).toContain("operationalRoster.data?.members");
    expect(vehicleRegisterSource).toContain('member.role === "DRIVER"');
  });

  it("keeps the VIN-first lifecycle intake and component coverage surface", () => {
    const componentLifecycleSource = readFileSync(new URL("../client/src/components/workspaces/ComponentLifecycleWorkspace.tsx", import.meta.url), "utf8");
    expect(componentLifecycleSource).toContain("Vehicle — VIN first");
    expect(componentLifecycleSource).toContain("Install and monitor component");
    expect(componentLifecycleSource).toContain("Component coverage");
  });
});
