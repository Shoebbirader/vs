alter table public.financial_records
  add column if not exists "approvalStatus" text not null default 'APPROVED',
  add column if not exists "approvedById" uuid,
  add column if not exists "approvalReason" text,
  add column if not exists "reversalOfId" uuid,
  add column if not exists "createdAt" timestamptz not null default now();

create index if not exists financial_records_org_approval_idx
  on public.financial_records ("orgId", "approvalStatus");

create index if not exists financial_records_reversal_idx
  on public.financial_records ("reversalOfId");
