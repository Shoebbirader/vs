create table if not exists public.idempotency_records (
  "id" uuid primary key default gen_random_uuid(),
  "orgId" uuid not null references public.organizations("id") on delete cascade,
  "userId" uuid not null references public.users("id") on delete cascade,
  "idempotencyKey" text not null,
  "procedure" text not null,
  "createdAt" timestamptz not null default now(),
  constraint idempotency_records_scope_unique unique ("orgId", "userId", "idempotencyKey", "procedure")
);

create index if not exists idx_idempotency_records_created_at
  on public.idempotency_records ("createdAt");

alter table public.idempotency_records enable row level security;

create policy idempotency_records_tenant_all on public.idempotency_records
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());
