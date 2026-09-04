export type FleetOpsPlan = "STARTER" | "GROWTH" | "SCALE" | "ENTERPRISE";

export type BillingPlan = {
  id: FleetOpsPlan;
  name: string;
  platformFeePaise: number;
  includedVehicles: number;
  overageVehicleFeePaise: number;
  maxUsers: number;
  description: string;
  minVehicles: number;
  maxVehicles: number;
};

// BILLING_PLANS_V2: New pricing model effective 2026-09-04
// Tiers have minimum and maximum vehicle thresholds to prevent gaming and ensure fair pricing
export const BILLING_PLANS: Record<FleetOpsPlan, BillingPlan> = {
  STARTER: { id: "STARTER", name: "Starter", platformFeePaise: 299900, includedVehicles: 3, overageVehicleFeePaise: 50000, maxUsers: 999999, minVehicles: 1, maxVehicles: 10, description: "For small operators and pilots." },
  GROWTH: { id: "GROWTH", name: "Growth", platformFeePaise: 999900, includedVehicles: 15, overageVehicleFeePaise: 45000, maxUsers: 999999, minVehicles: 11, maxVehicles: 49, description: "For growing regional fleets." },
  SCALE: { id: "SCALE", name: "Scale", platformFeePaise: 2499900, includedVehicles: 50, overageVehicleFeePaise: 35000, maxUsers: 999999, minVehicles: 50, maxVehicles: 99, description: "For multi-depot operators." },
  ENTERPRISE: { id: "ENTERPRISE", name: "Enterprise", platformFeePaise: 0, includedVehicles: 100, overageVehicleFeePaise: 30000, maxUsers: 999999, minVehicles: 100, maxVehicles: 999999, description: "For large fleets with custom service and integrations." },
};

export function normalizePlan(value: unknown): FleetOpsPlan {
  const candidate = String(value ?? "").toUpperCase();
  if (candidate === "STARTER" || candidate === "GROWTH" || candidate === "SCALE" || candidate === "ENTERPRISE") return candidate;
  return "STARTER";
}

export function calculateMonthlyBill(planValue: unknown, activeVehicles: number, usageAddonsPaise = 0, creditsPaise = 0) {
  const plan = BILLING_PLANS[normalizePlan(planValue)];
  const billableVehicles = Math.max(0, Math.floor(activeVehicles));
  const overageVehicles = Math.max(0, billableVehicles - plan.includedVehicles);
  const subtotalPaise = Math.max(0, plan.platformFeePaise + overageVehicles * plan.overageVehicleFeePaise + Math.max(0, Math.floor(usageAddonsPaise)) - Math.max(0, Math.floor(creditsPaise)));
  return { plan, billableVehicles, overageVehicles, platformFeePaise: plan.platformFeePaise, overagePaise: overageVehicles * plan.overageVehicleFeePaise, usageAddonsPaise: Math.max(0, Math.floor(usageAddonsPaise)), creditsPaise: Math.max(0, Math.floor(creditsPaise)), subtotalPaise };
}

export function billingLifecycle(trialEndsAt: Date, paymentFailedAt?: Date | null, now = new Date()) {
  if (paymentFailedAt) {
    const elapsedDays = Math.floor((now.getTime() - paymentFailedAt.getTime()) / 86_400_000);
    if (elapsedDays <= 7) return "PAYMENT_GRACE" as const;
    if (elapsedDays <= 21) return "READ_ONLY_GRACE" as const;
    return "SUSPENDED" as const;
  }
  return trialEndsAt.getTime() >= now.getTime() ? "TRIAL" as const : "ACTIVE" as const;
}

export function billingWriteAllowed(status: unknown) {
  return status !== "SUSPENDED" && status !== "CANCELLED";
}

export function validatePlanEligibility(plan: FleetOpsPlan, activeVehicles: number) {
  const planConfig = BILLING_PLANS[plan];
  if (activeVehicles < planConfig.minVehicles) {
    return { eligible: false, reason: `This plan requires at least ${planConfig.minVehicles} vehicle${planConfig.minVehicles === 1 ? "" : "s"}. You currently have ${activeVehicles}.` };
  }
  if (activeVehicles > planConfig.maxVehicles) {
    return { eligible: false, reason: `This plan supports up to ${planConfig.maxVehicles} vehicles. You currently have ${activeVehicles}.` };
  }
  return { eligible: true, reason: null };
}

export function comparePlanChange(fromPlan: unknown, toPlan: unknown, activeVehicles: number) {
  const from = calculateMonthlyBill(fromPlan, activeVehicles);
  const to = calculateMonthlyBill(toPlan, activeVehicles);
  return { fromPlan: from.plan.id, toPlan: to.plan.id, fromSubtotalPaise: from.subtotalPaise, toSubtotalPaise: to.subtotalPaise, monthlyDeltaPaise: to.subtotalPaise - from.subtotalPaise, direction: to.subtotalPaise === from.subtotalPaise ? "UNCHANGED" as const : to.subtotalPaise > from.subtotalPaise ? "UPGRADE" as const : "DOWNGRADE" as const };
}

export function formatInrPaise(paise: number) {
  return `₹${(Math.max(0, paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
