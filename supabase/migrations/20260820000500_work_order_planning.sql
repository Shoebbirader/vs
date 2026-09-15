-- FleetOps P1 work-order planning fields.
-- Apply with the Supabase CLI against the linked PostgreSQL project.
alter table public.work_orders
  add column if not exists "scheduledFor" timestamptz,
  add column if not exists "archivedAt" timestamptz;

create index if not exists work_orders_org_scheduled_idx
  on public.work_orders ("orgId", "scheduledFor")
  where "archivedAt" is null;
