create unique index if not exists uq_billing_invoices_org_period
  on public.billing_invoices ("orgId", "billingPeriodStart");
