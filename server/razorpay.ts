import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, fleetDb } from "./db";

export function isRazorpayWebhookEnabled() {
  const secret = process.env.RAZORPAY_LIVE_ENABLED === "true"
    ? process.env.RAZORPAY_LIVE_WEBHOOK_SECRET
    : process.env.RAZORPAY_TEST_WEBHOOK_SECRET;
  const enabled = process.env.RAZORPAY_LIVE_ENABLED === "true"
    ? process.env.RAZORPAY_LIVE_WEBHOOK_ENABLED
    : process.env.RAZORPAY_TEST_WEBHOOK_ENABLED;
  return enabled === "true" && Boolean(secret);
}

export function assertRazorpayTestMode() {
  if (process.env.NODE_ENV === "production" && process.env.RAZORPAY_LIVE_ENABLED !== "true") {
    throw new Error("Razorpay Test Mode is disabled in production; configure live Razorpay credentials");
  }
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
  const secret = process.env.RAZORPAY_LIVE_ENABLED === "true"
    ? process.env.RAZORPAY_LIVE_WEBHOOK_SECRET
    : process.env.RAZORPAY_TEST_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    subscription?: { entity?: { notes?: { orgId?: string } } };
  };
};

export async function processRazorpayWebhook(input: {
  rawBody: string;
  signature: string | null | undefined;
  eventId: string | null | undefined;
  requestId?: string;
}) {
  const requestId = input.requestId ?? "unknown";
  const error = (message: string, status: 400 | 404 = 400) => ({
    status,
    body: { error: message, requestId },
  });

  if (!isRazorpayWebhookEnabled()) {
    return error("Webhook processing is disabled", 404);
  }
  if (!verifyRazorpayWebhook(input.rawBody, input.signature)) {
    return error("Invalid webhook signature");
  }
  if (!input.eventId || input.eventId.length > 200) {
    return error("Missing or invalid webhook event id");
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(input.rawBody) as RazorpayWebhookPayload;
  } catch {
    return error("Invalid webhook JSON");
  }

  const eventType = payload.event ?? "unknown";
  const recorded = await db.execute(
    sql`INSERT INTO "razorpay_webhook_events" ("event_id", "event_type")
        VALUES (${input.eventId}, ${eventType})
        ON CONFLICT ("event_id") DO NOTHING
        RETURNING "id"`
  );
  if (!recorded.rows.length) {
    return {
      status: 200,
      body: { received: true, eventId: input.eventId, duplicate: true },
    };
  }

  const orgId = payload.payload?.subscription?.entity?.notes?.orgId;
  const supportedEvents = [
    "subscription.activated",
    "subscription.charged",
    "subscription.pending",
    "subscription.halted",
  ];
  if (orgId && supportedEvents.includes(payload.event ?? "")) {
    const billingStatus =
      payload.event === "subscription.halted"
        ? "SUSPENDED"
        : payload.event === "subscription.pending"
          ? "PAYMENT_GRACE"
          : "ACTIVE";
    await fleetDb.organization.update({
      where: { id: orgId },
      data: {
        billingStatus,
        paymentFailedAt: billingStatus === "PAYMENT_GRACE" ? new Date() : null,
        suspendedAt: billingStatus === "SUSPENDED" ? new Date() : null,
      },
    });
  }

  return {
    status: 200,
    body: {
      received: true,
      eventId: input.eventId,
      mode: process.env.RAZORPAY_LIVE_ENABLED === "true" ? "LIVE" : "TEST",
    },
  };
}
