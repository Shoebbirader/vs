export type VehicleIdentitySource = { vin?: string | null; licensePlate?: string | null; make?: string | null; model?: string | null } | null | undefined;

export function vehicleIdentity(vehicle: VehicleIdentitySource) {
  const vin = String(vehicle?.vin ?? "").trim().toUpperCase();
  const registration = String(vehicle?.licensePlate ?? "").trim().toUpperCase();
  if (vin && registration) return `VIN ${vin} · Reg ${registration}`;
  if (vin) return `VIN ${vin}`;
  if (registration) return `Reg ${registration}`;
  return "Vehicle unavailable";
}
