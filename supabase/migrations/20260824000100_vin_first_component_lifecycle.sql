ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS "chassisNumber" text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS "engineNumber" text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS "vehicleType" text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS "assignedRoute" text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS "depotLocation" text;
CREATE INDEX IF NOT EXISTS vehicles_org_vin_idx ON public.vehicles ("orgId", vin);

ALTER TABLE public.components ADD COLUMN IF NOT EXISTS "inventoryPartId" uuid;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS "componentType" text NOT NULL DEFAULT 'OTHER';
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS "componentSubtype" text;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS "partNumber" text;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS "serialNumber" text;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS "installationDate" timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS "expectedLifeDays" integer;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS "alertThresholdDays" integer;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX IF NOT EXISTS components_vehicle_type_idx ON public.components ("vehicleId", "componentType");
