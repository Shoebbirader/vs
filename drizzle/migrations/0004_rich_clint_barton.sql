CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"actorId" uuid,
	"actorRole" text,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" uuid,
	"summary" text NOT NULL,
	"metadata" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"partId" uuid NOT NULL,
	"workOrderId" uuid,
	"actorId" uuid,
	"movementType" text NOT NULL,
	"quantity" integer NOT NULL,
	"unitCost" numeric NOT NULL,
	"reason" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
