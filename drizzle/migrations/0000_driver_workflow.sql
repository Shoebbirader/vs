CREATE TABLE IF NOT EXISTS "dvir_inspections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "orgId" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vehicleId" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
  "driverId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "inspectionType" text NOT NULL,
  "status" text NOT NULL,
  "notes" text,
  "photoUrl" text,
  "photoKey" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dvir_inspections_org_idx" ON "dvir_inspections" ("orgId", "createdAt" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fuel_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "orgId" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vehicleId" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
  "driverId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "liters" numeric NOT NULL,
  "amount" numeric NOT NULL,
  "odometer" numeric NOT NULL,
  "station" text,
  "receiptUrl" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fuel_logs_org_idx" ON "fuel_logs" ("orgId", "createdAt" DESC);
