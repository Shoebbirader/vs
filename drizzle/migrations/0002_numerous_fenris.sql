CREATE TABLE "work_order_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"workOrderId" uuid NOT NULL,
	"uploadedById" uuid NOT NULL,
	"fileUrl" text NOT NULL,
	"fileKey" text,
	"caption" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "startedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "laborHours" numeric;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "repairNotes" text;--> statement-breakpoint