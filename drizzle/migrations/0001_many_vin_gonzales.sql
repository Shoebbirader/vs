CREATE TABLE "vehicle_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"vehicleId" uuid NOT NULL,
	"driverId" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_org_fk" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_vehicle_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE;
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_driver_fk" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "vehicle_assignments_org_driver_active_idx" ON "vehicle_assignments" ("orgId", "driverId", "active");
CREATE INDEX IF NOT EXISTS "vehicle_assignments_vehicle_active_idx" ON "vehicle_assignments" ("vehicleId", "active");
ALTER TABLE "vehicle_assignments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_assignments_member_read" ON "vehicle_assignments" FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM "users" u WHERE u."authUserId" = auth.uid() AND u."orgId" = "vehicle_assignments"."orgId"));
CREATE POLICY "vehicle_assignments_manager_write" ON "vehicle_assignments" FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM "users" u WHERE u."authUserId" = auth.uid() AND u."orgId" = "vehicle_assignments"."orgId" AND u."role" IN ('SUPERADMIN', 'FLEET_MANAGER'))) WITH CHECK (EXISTS (SELECT 1 FROM "users" u WHERE u."authUserId" = auth.uid() AND u."orgId" = "vehicle_assignments"."orgId" AND u."role" IN ('SUPERADMIN', 'FLEET_MANAGER')));
