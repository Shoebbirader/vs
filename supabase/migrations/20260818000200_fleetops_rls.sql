-- FleetOps tenant isolation and realtime publication.
-- The application always resolves the tenant from the authenticated Supabase user.

create or replace function public.current_fleetops_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select "orgId" from public.users where "authUserId" = auth.uid() limit 1;
$$;

revoke all on function public.current_fleetops_org_id() from public;
grant execute on function public.current_fleetops_org_id() to authenticated;

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.invitations enable row level security;
alter table public.vehicles enable row level security;
alter table public.components enable row level security;
alter table public.odometer_logs enable row level security;
alter table public.work_orders enable row level security;
alter table public.inventory_parts enable row level security;
alter table public.work_order_parts enable row level security;
alter table public.vendors enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.financial_records enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;

create policy organizations_tenant_select on public.organizations
  for select to authenticated
  using (id = public.current_fleetops_org_id());

create policy organizations_tenant_update on public.organizations
  for update to authenticated
  using (id = public.current_fleetops_org_id())
  with check (id = public.current_fleetops_org_id());

create policy users_tenant_select on public.users
  for select to authenticated
  using ("orgId" = public.current_fleetops_org_id());

create policy users_self_update on public.users
  for update to authenticated
  using ("authUserId" = auth.uid())
  with check ("authUserId" = auth.uid() and "orgId" = public.current_fleetops_org_id());

create policy invitations_tenant_all on public.invitations
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy vehicles_tenant_all on public.vehicles
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy components_tenant_all on public.components
  for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = "vehicleId" and v."orgId" = public.current_fleetops_org_id()))
  with check (exists (select 1 from public.vehicles v where v.id = "vehicleId" and v."orgId" = public.current_fleetops_org_id()));

create policy odometer_logs_tenant_all on public.odometer_logs
  for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = "vehicleId" and v."orgId" = public.current_fleetops_org_id()))
  with check (exists (select 1 from public.vehicles v where v.id = "vehicleId" and v."orgId" = public.current_fleetops_org_id()));

create policy work_orders_tenant_all on public.work_orders
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy inventory_parts_tenant_all on public.inventory_parts
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy work_order_parts_tenant_all on public.work_order_parts
  for all to authenticated
  using (exists (select 1 from public.work_orders w where w.id = "workOrderId" and w."orgId" = public.current_fleetops_org_id()))
  with check (exists (select 1 from public.work_orders w where w.id = "workOrderId" and w."orgId" = public.current_fleetops_org_id()));

create policy vendors_tenant_all on public.vendors
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy purchase_orders_tenant_all on public.purchase_orders
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy financial_records_tenant_all on public.financial_records
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy documents_tenant_all on public.documents
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy notifications_tenant_all on public.notifications
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

-- Expose only tenant-scoped changes through Supabase Realtime.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'vehicles', 'work_orders', 'inventory_parts', 'notifications', 'odometer_logs', 'documents'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;

-- MISSING RLS POLICIES FOR NEW TABLES
alter table public.vehicle_issues enable row level security;
alter table public.work_order_evidence enable row level security;
alter table public.audit_events enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.vehicle_assignments enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_payments enable row level security;
alter table public.dvir_inspections enable row level security;
alter table public.fuel_logs enable row level security;

create policy vehicle_issues_tenant_all on public.vehicle_issues
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy work_order_evidence_tenant_all on public.work_order_evidence
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy audit_events_tenant_all on public.audit_events
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy inventory_movements_tenant_all on public.inventory_movements
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy vehicle_assignments_tenant_all on public.vehicle_assignments
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy billing_invoices_tenant_all on public.billing_invoices
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy billing_payments_tenant_all on public.billing_payments
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy dvir_inspections_tenant_all on public.dvir_inspections
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

create policy fuel_logs_tenant_all on public.fuel_logs
  for all to authenticated
  using ("orgId" = public.current_fleetops_org_id())
  with check ("orgId" = public.current_fleetops_org_id());

-- Add missing Realtime publications
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'vehicle_issues', 'work_order_evidence', 'audit_events', 'inventory_movements', 
    'vehicle_assignments', 'billing_invoices', 'billing_payments', 'dvir_inspections', 'fuel_logs'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
