alter table if exists public.invitations
  add column if not exists "revokedAt" timestamptz,
  add column if not exists "revokedById" uuid,
  add column if not exists "resendCount" integer not null default 0,
  add column if not exists "lastSentAt" timestamptz;

create index if not exists invitations_org_email_active_idx
  on public.invitations ("orgId", lower(email), "createdAt" desc)
  where "acceptedAt" is null and "revokedAt" is null;

create index if not exists invitations_org_expiry_idx
  on public.invitations ("orgId", "expiresAt");
