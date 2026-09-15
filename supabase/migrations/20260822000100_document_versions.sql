-- FleetOps Phase 5 Compliance: append-only document version history.
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  "orgId" uuid not null references public.organizations(id) on delete cascade,
  "documentId" uuid not null references public.documents(id) on delete cascade,
  "versionNumber" integer not null check ("versionNumber" > 0),
  title text not null,
  "docType" text not null,
  "fileUrl" text not null,
  "fileKey" text,
  "fileChecksum" text,
  "fileSizeBytes" integer,
  "expiryDate" timestamptz not null,
  "createdById" uuid not null references public.users(id) on delete restrict,
  "createdAt" timestamptz not null default now(),
  unique ("documentId", "versionNumber")
);
create index if not exists document_versions_org_document_idx
  on public.document_versions ("orgId", "documentId", "versionNumber" desc);

alter table public.document_versions enable row level security;
create policy document_versions_org_isolation on public.document_versions
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());
