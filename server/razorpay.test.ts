import { describe, expect, it } from "vitest";

describe("Razorpay Test Mode credentials", () => {
  it("authenticates against the Test Mode API without creating a payment", async () => {
    const keyId = process.env.RAZORPAY_TEST_KEY_ID;
    const keySecret = process.env.RAZORPAY_TEST_KEY_SECRET;
    expect(keyId).toMatch(/^rzp_test_/);
    expect(keySecret).toBeTruthy();

    const response = await fetch("https://api.razorpay.com/v1/payments?count=1", {
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entity?: string; count?: number };
    expect(body.entity).toBe("collection");
    expect(typeof body.count).toBe("number");
  }, 20_000);
});
