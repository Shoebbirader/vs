-- Public, read-only marketing assets for the VahanSync landing page.
-- Uploads are performed by an authorized deployment workflow, not browser clients.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vahansync-media',
  'vahansync-media',
  true,
  26214400,
  ARRAY['video/mp4']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ============================================================================
-- PERFORMANCE INDEXES - Added 2026-09-04
-- Purpose: Add indexes across all tables for query optimization
-- ============================================================================

-- Organizations table indexes
CREATE INDEX IF NOT EXISTS idx_organizations_tier ON public.organizations("subscriptionTier");

-- Organization Settings table indexes
CREATE INDEX IF NOT EXISTS idx_org_settings_orgId ON public.organization_settings("orgId");

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_orgId ON public.users("orgId");
CREATE INDEX IF NOT EXISTS idx_users_authUserId ON public.users("authUserId");
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Invitations table indexes
CREATE INDEX IF NOT EXISTS idx_invitations_orgId ON public.invitations("orgId");
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations("tokenHash");

-- Vehicles table indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_orgId ON public.vehicles("orgId");
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON public.vehicles(status);

-- Vehicle Assignments table indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_orgId ON public.vehicle_assignments("orgId");
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_vehicleId ON public.vehicle_assignments("vehicleId");
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_driverId ON public.vehicle_assignments("driverId");

-- Components table indexes
CREATE INDEX IF NOT EXISTS idx_components_vehicleId ON public.components("vehicleId");

-- Odometer Logs table indexes
CREATE INDEX IF NOT EXISTS idx_odometer_logs_vehicleId ON public.odometer_logs("vehicleId");
CREATE INDEX IF NOT EXISTS idx_odometer_logs_driverId ON public.odometer_logs("driverId");

-- Work Orders table indexes
CREATE INDEX IF NOT EXISTS idx_work_orders_orgId ON public.work_orders("orgId");
CREATE INDEX IF NOT EXISTS idx_work_orders_vehicleId ON public.work_orders("vehicleId");
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON public.work_orders(status);

-- Work Order Evidence table indexes
CREATE INDEX IF NOT EXISTS idx_work_order_evidence_workOrderId ON public.work_order_evidence("workOrderId");

-- Inventory Parts table indexes
CREATE INDEX IF NOT EXISTS idx_inventory_parts_orgId ON public.inventory_parts("orgId");
CREATE INDEX IF NOT EXISTS idx_inventory_parts_sku ON public.inventory_parts(sku);

-- Work Order Parts table indexes
CREATE INDEX IF NOT EXISTS idx_work_order_parts_workOrderId ON public.work_order_parts("workOrderId");

-- Vendors table indexes
CREATE INDEX IF NOT EXISTS idx_vendors_orgId ON public.vendors("orgId");

-- Purchase Orders table indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_orgId ON public.purchase_orders("orgId");

-- Purchase Order Receipts table indexes
CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_poId ON public.purchase_order_receipts("purchaseOrderId");

-- Financial Records table indexes
CREATE INDEX IF NOT EXISTS idx_financial_records_orgId ON public.financial_records("orgId");
CREATE INDEX IF NOT EXISTS idx_financial_records_vehicleId ON public.financial_records("vehicleId");

-- Documents table indexes
CREATE INDEX IF NOT EXISTS idx_documents_orgId ON public.documents("orgId");
CREATE INDEX IF NOT EXISTS idx_documents_expiryDate ON public.documents("expiryDate");

-- Document Versions table indexes
CREATE INDEX IF NOT EXISTS idx_document_versions_documentId ON public.document_versions("documentId");

-- Notifications table indexes
CREATE INDEX IF NOT EXISTS idx_notifications_recipientId ON public.notifications("recipientId");

-- Notification Deliveries table indexes
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notificationId ON public.notification_deliveries("notificationId");

-- Vehicle Issues table indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_issues_orgId ON public.vehicle_issues("orgId");
CREATE INDEX IF NOT EXISTS idx_vehicle_issues_vehicleId ON public.vehicle_issues("vehicleId");

-- Audit Events table indexes
CREATE INDEX IF NOT EXISTS idx_audit_events_orgId ON public.audit_events("orgId");
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events(action);

-- Inventory Movements table indexes
CREATE INDEX IF NOT EXISTS idx_inventory_movements_partId ON public.inventory_movements("partId");
CREATE INDEX IF NOT EXISTS idx_inventory_movements_workOrderId ON public.inventory_movements("workOrderId");

-- Billing Invoices table indexes
CREATE INDEX IF NOT EXISTS idx_billing_invoices_orgId ON public.billing_invoices("orgId");

-- Billing Payments table indexes
CREATE INDEX IF NOT EXISTS idx_billing_payments_orgId ON public.billing_payments("orgId");
CREATE INDEX IF NOT EXISTS idx_billing_payments_invoiceId ON public.billing_payments("invoiceId");

-- DVIR Inspections table indexes
CREATE INDEX IF NOT EXISTS idx_dvir_inspections_orgId ON public.dvir_inspections("orgId");
CREATE INDEX IF NOT EXISTS idx_dvir_inspections_vehicleId ON public.dvir_inspections("vehicleId");

-- Fuel Logs table indexes
CREATE INDEX IF NOT EXISTS idx_fuel_logs_orgId ON public.fuel_logs("orgId");
CREATE INDEX IF NOT EXISTS idx_fuel_logs_vehicleId ON public.fuel_logs("vehicleId");
