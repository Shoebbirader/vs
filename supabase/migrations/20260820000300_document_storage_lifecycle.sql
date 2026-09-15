alter table public.documents
  add column if not exists "fileChecksum" text,
  add column if not exists "fileSizeBytes" integer,
  add column if not exists "retentionUntil" timestamptz;

create index if not exists documents_org_checksum_idx
  on public.documents ("orgId", "fileChecksum");

create index if not exists documents_retention_idx
  on public.documents ("retentionUntil");
