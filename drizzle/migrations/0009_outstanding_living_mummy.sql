ALTER TABLE "organizations" ADD COLUMN "subscriptionStartedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "renewalAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "paymentFailedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billingStatus" text DEFAULT 'TRIAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspendedAt" timestamp with time zone;