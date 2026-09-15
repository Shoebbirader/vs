import { describe, expect, it } from "vitest";
import { isIndianE164Mobile, normalizeIndianE164Mobile } from "./profile-validation";

describe("member mobile validation", () => {
  it("accepts and normalizes a valid Indian E.164 mobile number", () => {
    expect(isIndianE164Mobile("+919876543210")).toBe(true);
    expect(normalizeIndianE164Mobile(" +91 9876543210 ")).toBe("+919876543210");
  });

  it("rejects incomplete, non-Indian, and invalid Indian mobile numbers", () => {
    expect(isIndianE164Mobile("9876543210")).toBe(false);
    expect(isIndianE164Mobile("+915876543210")).toBe(false);
    expect(isIndianE164Mobile("+14155552671")).toBe(false);
    expect(() => normalizeIndianE164Mobile("+915876543210")).toThrow("+91XXXXXXXXXX");
  });
});
