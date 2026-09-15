create unique index if not exists uq_active_assignment_org_driver
  on public.vehicle_assignments ("orgId", "driverId")
  where "active" = true;

create unique index if not exists uq_active_assignment_org_vehicle
  on public.vehicle_assignments ("orgId", "vehicleId")
  where "active" = true;
