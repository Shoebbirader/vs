import { createHmac, timingSafeEqual } from "node:crypto";

export function isRazorpayWebhookEnabled() {
  return process.env.RAZORPAY_TEST_WEBHOOK_ENABLED === "true" && Boolean(process.env.RAZORPAY_TEST_WEBHOOK_SECRET);
}

export function assertRazorpayTestMode() {
  const keyId = process.env.RAZORPAY_TEST_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_TEST_KEY_SECRET ?? "";
  if (!keyId.startsWith("rzp_test_") || !keySecret) throw new Error("Razorpay Test Mode credentials are not configured");
  return { keyId, keySecret };
}

export async function createRazorpayTestOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }) {
  const { keyId, keySecret } = assertRazorpayTestMode();
  const amount = Math.max(100, Math.floor(input.amountPaise));
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency: "INR", receipt: input.receipt.slice(0, 40), notes: input.notes ?? {} }),
  });
  if (!response.ok) throw new Error(`Razorpay Test Mode order request failed (${response.status})`);
  return (await response.json()) as { id: string; entity: "order"; amount: number; currency: string; status: string };
}

export function verifyRazorpayWebhook(rawBody: string, signature: string | null | undefined) {
  const secret = process.env.RAZORPAY_TEST_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
