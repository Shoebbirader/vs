export const FLEET_ROLES = [
  "SUPERADMIN",
  "FLEET_MANAGER",
  "INVENTORY_MANAGER",
  "MECHANIC",
  "TECHNICIAN",
  "DRIVER",
  "ACCOUNTANT",
] as const;

export type FleetRole = (typeof FLEET_ROLES)[number];

export const ROLE_POLICIES = {
  governance: ["SUPERADMIN"],
  fleetOperations: ["SUPERADMIN", "FLEET_MANAGER"],
  inventoryControl: ["SUPERADMIN", "INVENTORY_MANAGER"],
  fieldExecution: ["MECHANIC", "TECHNICIAN"],
  driverSafety: ["DRIVER"],
  finance: ["SUPERADMIN", "ACCOUNTANT"],
} as const satisfies Record<string, readonly FleetRole[]>;

export function roleCanAct(role: string, allowed: readonly FleetRole[]) {
  return allowed.includes(role as FleetRole);
}

export function tenantScope(orgId: string) {
  return { orgId } as const;
}
