CREATE TABLE IF NOT EXISTS public.organization_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" uuid NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  "odometerMaxDailyKm" integer NOT NULL DEFAULT 1000,
  "safetyContactName" text,
  "safetyContactPhone" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
