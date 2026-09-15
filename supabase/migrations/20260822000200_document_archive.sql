-- FleetOps Phase 5 Compliance: reversible document archive controls.
alter table public.documents
  add column if not exists "archivedAt" timestamptz,
  add column if not exists "archivedById" uuid references public.users(id) on delete set null;
create index if not exists documents_org_active_expiry_idx
  on public.documents ("orgId", "expiryDate")
  where "archivedAt" is null;
