import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schemaSource = readFileSync("drizzle/fleetops-schema.ts", "utf8");
const routerSource = readFileSync("server/routers.ts", "utf8");
const migrationSource = readFileSync(
  "supabase/migrations/20260915000300_billing_invoice_period_unique.sql",
  "utf8"
);

describe("billing invoice period integrity", () => {
  it("enforces one invoice snapshot per organization and billing period", () => {
    expect(schemaSource).toContain(
      'uniqueIndex("uq_billing_invoices_org_period").on(table.orgId, table.billingPeriodStart)'
    );
    expect(migrationSource).toContain(
      "create unique index if not exists uq_billing_invoices_org_period"
    );
    expect(migrationSource).toContain(
      'on public.billing_invoices ("orgId", "billingPeriodStart")'
    );
  });

  it("returns the winner when concurrent invoice creation hits the unique constraint", () => {
    expect(routerSource).toContain(
      'if ((error as { code?: string }).code !== "23505") throw error;'
    );
    expect(routerSource).toContain(
      "const concurrent = await fleetDb.billingInvoice.findFirst"
    );
  });
});
