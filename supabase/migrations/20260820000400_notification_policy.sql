alter table public.notifications
  add column if not exists severity text not null default 'INFO',
  add column if not exists "sourceType" text not null default 'SYSTEM',
  add column if not exists "dedupeKey" text,
  add column if not exists "acknowledgedAt" timestamptz,
  add column if not exists "escalationLevel" integer not null default 0,
  add column if not exists "resolvedAt" timestamptz;

create unique index if not exists notifications_active_dedupe_idx
  on public.notifications ("orgId", "recipientId", "dedupeKey")
  where "dedupeKey" is not null and "resolvedAt" is null;
