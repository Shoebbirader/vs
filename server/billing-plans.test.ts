import { describe, expect, it } from "vitest";
import { BILLING_PLANS, billingLifecycle, billingWriteAllowed, calculateMonthlyBill, comparePlanChange, formatInrPaise } from "./billing-plans";

describe("FleetOps billing plans", () => {
  it("matches the approved plan catalog", () => {
    expect(BILLING_PLANS.STARTER).toMatchObject({ platformFeePaise: 299900, includedVehicles: 3, overageVehicleFeePaise: 50000 });
    expect(BILLING_PLANS.GROWTH).toMatchObject({ platformFeePaise: 999900, includedVehicles: 15, overageVehicleFeePaise: 45000 });
    expect(BILLING_PLANS.SCALE).toMatchObject({ platformFeePaise: 2499900, includedVehicles: 50, overageVehicleFeePaise: 35000 });
    expect(BILLING_PLANS.ENTERPRISE).toMatchObject({ platformFeePaise: 0, includedVehicles: 100, overageVehicleFeePaise: 30000 });
  });

  it("calculates 100-vehicle Growth billing deterministically", () => {
    const bill = calculateMonthlyBill("GROWTH", 100);
    expect(bill.overageVehicles).toBe(85);
    expect(bill.subtotalPaise).toBe(4824900);
    expect(formatInrPaise(bill.subtotalPaise)).toBe("₹48,249.00");
  });

  it("keeps credits and add-ons in the invoice calculation", () => {
    const bill = calculateMonthlyBill("STARTER", 12, 12500, 5000);
    expect(bill.overageVehicles).toBe(9);
    expect(bill.subtotalPaise).toBe(757400);
  });

  it("models seven-day write grace, read-only grace, and suspension", () => {
    const paymentFailedAt = new Date("2026-01-01T00:00:00Z");
    expect(billingLifecycle(new Date("2026-01-01T00:00:00Z"), paymentFailedAt, new Date("2026-01-07T00:00:00Z"))).toBe("PAYMENT_GRACE");
    expect(billingLifecycle(new Date("2026-01-01T00:00:00Z"), paymentFailedAt, new Date("2026-01-15T00:00:00Z"))).toBe("READ_ONLY_GRACE");
    expect(billingLifecycle(new Date("2026-01-01T00:00:00Z"), paymentFailedAt, new Date("2026-01-30T00:00:00Z"))).toBe("SUSPENDED");
  });

  it("compares upgrades, downgrades, and unchanged renewals without payment side effects", () => {
    expect(comparePlanChange("STARTER", "GROWTH", 25).direction).toBe("UPGRADE");
    expect(comparePlanChange("SCALE", "GROWTH", 100).direction).toBe("UPGRADE");
    expect(comparePlanChange("GROWTH", "GROWTH", 100).direction).toBe("UNCHANGED");
    expect(billingLifecycle(new Date("2026-01-01T00:00:00Z"), null, new Date("2026-02-01T00:00:00Z"))).toBe("ACTIVE");
    expect(billingWriteAllowed("PAYMENT_GRACE")).toBe(true);
    expect(billingWriteAllowed("CANCELLED")).toBe(false);
  });
});
