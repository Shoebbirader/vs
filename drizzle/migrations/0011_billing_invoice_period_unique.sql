CREATE UNIQUE INDEX "uq_billing_invoices_org_period" ON "billing_invoices" USING btree ("orgId","billingPeriodStart");
