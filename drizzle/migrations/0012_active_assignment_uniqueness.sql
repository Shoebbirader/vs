CREATE UNIQUE INDEX "uq_active_assignment_org_driver" ON "vehicle_assignments" USING btree ("orgId","driverId") WHERE "active" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_active_assignment_org_vehicle" ON "vehicle_assignments" USING btree ("orgId","vehicleId") WHERE "active" = true;
