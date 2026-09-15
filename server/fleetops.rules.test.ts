import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertWritable, requireRole, validateOdometerReading } from "./routers";

describe("FleetOps rules", () => {
  it("allows writes during an active trial", () => {
    expect(() => assertWritable({ subscriptionTier: "TRIAL_FREE", trialEndsAt: new Date(Date.now() + 60_000) })).not.toThrow();
  });

  it("blocks writes after the trial expires", () => {
    expect(() => assertWritable({ subscriptionTier: "TRIAL_FREE", trialEndsAt: new Date(Date.now() - 60_000) })).toThrowError(TRPCError);
  });

  it("blocks persisted suspended accounts while allowing payment-grace writes", () => {
    expect(() => assertWritable({ subscriptionTier: "GROWTH", trialEndsAt: new Date(Date.now() - 60_000), billingStatus: "PAYMENT_GRACE" })).not.toThrow();
    expect(() => assertWritable({ subscriptionTier: "GROWTH", trialEndsAt: new Date(Date.now() - 60_000), billingStatus: "SUSPENDED" })).toThrowError(TRPCError);
  });

  it("allows only explicitly granted roles", () => {
    expect(() => requireRole("MECHANIC", ["MECHANIC", "TECHNICIAN"])).not.toThrow();
    expect(() => requireRole("DRIVER", ["MECHANIC", "TECHNICIAN"])).toThrowError(TRPCError);
  });

  it("restricts organization onboarding completion to Superadmins", () => {
    expect(() => requireRole("SUPERADMIN", ["SUPERADMIN"])).not.toThrow();
    expect(() => requireRole("FLEET_MANAGER", ["SUPERADMIN"])).toThrowError(TRPCError);
  });

  it("blocks odometer rollback and unrealistic jumps", () => {
    expect(() => validateOdometerReading(10000, 9999)).toThrowError(TRPCError);
    expect(() => validateOdometerReading(10000, 11001)).toThrowError(TRPCError);
    expect(() => validateOdometerReading(10000, 10500)).not.toThrow();
  });
});
