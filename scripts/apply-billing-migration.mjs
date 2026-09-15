import { Client } from "pg";

const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS "billing_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "orgId" uuid NOT NULL,
  "billingPeriodStart" timestamptz NOT NULL,
  "billingPeriodEnd" timestamptz NOT NULL,
  "plan" text NOT NULL,
  "billableVehicles" integer NOT NULL,
  "includedVehicles" integer NOT NULL,
  "overageVehicles" integer NOT NULL,
  "platformFeePaise" integer NOT NULL,
  "overagePaise" integer NOT NULL,
  "usageAddonsPaise" integer NOT NULL DEFAULT 0,
  "creditsPaise" integer NOT NULL DEFAULT 0,
  "subtotalPaise" integer NOT NULL,
  "taxPaise" integer NOT NULL DEFAULT 0,
  "totalPaise" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "externalInvoiceId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);`);
await client.query(`CREATE TABLE IF NOT EXISTS "billing_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "orgId" uuid NOT NULL,
  "invoiceId" uuid NOT NULL,
  "provider" text NOT NULL DEFAULT 'RAZORPAY',
  "providerPaymentId" text,
  "status" text NOT NULL,
  "amountPaise" integer NOT NULL,
  "paidAt" timestamptz,
  "failureReason" text,
  "metadata" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);`);
await client.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" timestamptz;`);
await client.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "renewalAt" timestamptz;`);
await client.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "paymentFailedAt" timestamptz;`);
await client.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billingStatus" text NOT NULL DEFAULT 'TRIAL';`);
await client.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "suspendedAt" timestamptz;`);
console.log("Supabase billing tables and organization lifecycle columns ready");
await client.end();
