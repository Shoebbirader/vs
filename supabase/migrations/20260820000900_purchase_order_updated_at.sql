-- FleetOps P1 Procurement: optimistic purchase-order lifecycle timestamps.
alter table public.purchase_orders
  add column if not exists "updatedAt" timestamptz not null default now();

update public.purchase_orders
set "updatedAt" = coalesce("updatedAt", "createdAt", now())
where "updatedAt" is null;
