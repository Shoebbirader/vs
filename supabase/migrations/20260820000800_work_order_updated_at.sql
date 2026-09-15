-- FleetOps PostgreSQL migration: restore the work-order update timestamp used by planning and board queries.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

UPDATE public.work_orders
SET "updatedAt" = COALESCE("completedAt", "startedAt", "createdAt", now())
WHERE "updatedAt" IS NULL;

CREATE INDEX IF NOT EXISTS work_orders_org_updated_at_idx
  ON public.work_orders ("orgId", "updatedAt" DESC);
