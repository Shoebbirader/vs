CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"billingPeriodStart" timestamp with time zone NOT NULL,
	"billingPeriodEnd" timestamp with time zone NOT NULL,
	"plan" text NOT NULL,
	"billableVehicles" integer NOT NULL,
	"includedVehicles" integer NOT NULL,
	"overageVehicles" integer NOT NULL,
	"platformFeePaise" integer NOT NULL,
	"overagePaise" integer NOT NULL,
	"usageAddonsPaise" integer DEFAULT 0 NOT NULL,
	"creditsPaise" integer DEFAULT 0 NOT NULL,
	"subtotalPaise" integer NOT NULL,
	"taxPaise" integer DEFAULT 0 NOT NULL,
	"totalPaise" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"externalInvoiceId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"invoiceId" uuid NOT NULL,
	"provider" text DEFAULT 'RAZORPAY' NOT NULL,
	"providerPaymentId" text,
	"status" text NOT NULL,
	"amountPaise" integer NOT NULL,
	"paidAt" timestamp with time zone,
	"failureReason" text,
	"metadata" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
