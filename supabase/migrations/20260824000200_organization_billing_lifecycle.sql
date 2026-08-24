ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "renewalAt" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "paymentFailedAt" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "billingStatus" text NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN IF NOT EXISTS "suspendedAt" timestamp with time zone;

UPDATE public.organizations
SET "billingStatus" = 'TRIAL'
WHERE "billingStatus" IS NULL;
