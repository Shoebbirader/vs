ALTER TABLE "components" ADD COLUMN "inventoryPartId" uuid;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "inventoryPartId" uuid;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "componentType" text DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "componentSubtype" text;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "partNumber" text;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "serialNumber" text;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "installationDate" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "expectedLifeDays" integer;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "alertThresholdDays" integer;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "chassisNumber" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "engineNumber" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "vehicleType" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "assignedRoute" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "depotLocation" text;
