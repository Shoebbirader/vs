-- FleetOps P1 Procurement: PO-linked partial receiving and lifecycle metadata.
alter table public.purchase_orders
  add column if not exists "supplierInvoiceNumber" text,
  add column if not exists "receivedAt" timestamptz,
  add column if not exists "closedAt" timestamptz;

create table if not exists public.purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  "orgId" uuid not null references public.organizations(id) on delete cascade,
  "purchaseOrderId" uuid not null references public.purchase_orders(id) on delete cascade,
  "partId" uuid not null references public.inventory_parts(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  "unitCost" numeric(14,2) not null check ("unitCost" >= 0),
  "invoiceNumber" text,
  location text,
  "receivedById" uuid not null references public.users(id) on delete restrict,
  "receivedAt" timestamptz not null default now()
);

create index if not exists purchase_order_receipts_org_order_idx
  on public.purchase_order_receipts ("orgId", "purchaseOrderId", "receivedAt");
