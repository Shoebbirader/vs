-- FleetOps Phase 3 Procurement: receipt variance capture.
alter table public.purchase_order_receipts
  add column if not exists "damagedQuantity" integer not null default 0,
  add column if not exists "backorderedQuantity" integer not null default 0,
  add column if not exists "varianceReason" text;
