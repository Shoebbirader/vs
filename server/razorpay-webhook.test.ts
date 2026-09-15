import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { assertRazorpayTestMode, isRazorpayWebhookEnabled, verifyRazorpayWebhook } from "./razorpay";

describe("Razorpay Test Mode boundaries", () => {
  it("requires a test-prefixed key and never accepts a live key", () => {
    vi.stubEnv("RAZORPAY_TEST_KEY_ID", "rzp_test_example");
    vi.stubEnv("RAZORPAY_TEST_KEY_SECRET", "secret");
    expect(assertRazorpayTestMode().keyId).toBe("rzp_test_example");
    vi.stubEnv("RAZORPAY_TEST_KEY_ID", "rzp_live_example");
    expect(() => assertRazorpayTestMode()).toThrow();
    vi.unstubAllEnvs();
  });

  it("keeps webhook processing disabled unless explicitly enabled", () => {
    vi.stubEnv("RAZORPAY_TEST_WEBHOOK_SECRET", "webhook_test_secret");
    vi.stubEnv("RAZORPAY_TEST_WEBHOOK_ENABLED", "false");
    expect(isRazorpayWebhookEnabled()).toBe(false);
    vi.stubEnv("RAZORPAY_TEST_WEBHOOK_ENABLED", "true");
    expect(isRazorpayWebhookEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("verifies the raw-body webhook signature and rejects tampering", () => {
    const body = JSON.stringify({ event: "payment.captured", id: "evt_test" });
    const secret = "webhook_test_secret";
    vi.stubEnv("RAZORPAY_TEST_WEBHOOK_SECRET", secret);
    const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyRazorpayWebhook(body, signature)).toBe(true);
    expect(verifyRazorpayWebhook(`${body}x`, signature)).toBe(false);
    expect(verifyRazorpayWebhook(body, "bad")).toBe(false);
    vi.unstubAllEnvs();
  });
});
