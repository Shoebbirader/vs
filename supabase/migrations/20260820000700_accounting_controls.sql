-- FleetOps P1 Accountant controls: GST/TDS metadata, cost centers, reconciliation.
alter table public.financial_records
  add column if not exists "taxAmount" numeric(14,2) not null default 0,
  add column if not exists "gstin" text,
  add column if not exists "taxCategory" text,
  add column if not exists "invoiceNumber" text,
  add column if not exists vendor text,
  add column if not exists "paymentMethod" text,
  add column if not exists "costCenterType" text,
  add column if not exists "costCenterId" uuid,
  add column if not exists "tdsAmount" numeric(14,2) not null default 0,
  add column if not exists "reconciledAt" timestamptz,
  add column if not exists "reconciliationRef" text;

create index if not exists financial_records_org_reconcile_idx
  on public.financial_records ("orgId", "reconciledAt", "transactionDate");
