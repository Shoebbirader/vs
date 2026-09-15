create table if not exists public.storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  "orgId" uuid not null,
  bucket text not null,
  "fileKey" text not null,
  reason text not null,
  attempts integer not null default 0,
  "nextAttemptAt" timestamptz not null default now(),
  "completedAt" timestamptz,
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_storage_cleanup_jobs_orgId
  on public.storage_cleanup_jobs ("orgId");
create index if not exists idx_storage_cleanup_jobs_pending
  on public.storage_cleanup_jobs ("nextAttemptAt");

alter table public.storage_cleanup_jobs enable row level security;
