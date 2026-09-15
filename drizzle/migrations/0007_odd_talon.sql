ALTER TABLE "documents" ADD COLUMN "archivedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "archivedById" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revokedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revokedById" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "resendCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "lastSentAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD COLUMN "damagedQuantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD COLUMN "backorderedQuantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD COLUMN "varianceReason" text;