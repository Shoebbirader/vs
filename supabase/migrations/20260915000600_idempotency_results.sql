alter table public.idempotency_records
  add column if not exists "requestHash" text,
  add column if not exists "status" text not null default 'PROCESSING',
  add column if not exists "resultJson" text,
  add column if not exists "completedAt" timestamptz,
  add column if not exists "expiresAt" timestamptz;

update public.idempotency_records
set
  "requestHash" = coalesce("requestHash", ''),
  "expiresAt" = coalesce("expiresAt", "createdAt" + interval '7 days')
where "requestHash" is null or "expiresAt" is null;

alter table public.idempotency_records
  alter column "requestHash" set not null,
  alter column "expiresAt" set not null;

create index if not exists idx_idempotency_records_expiry
  on public.idempotency_records ("expiresAt");
