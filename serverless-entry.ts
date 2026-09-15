import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./server/routers.ts";
import { createContext } from "./server/_core/context.ts";
import { db, fleetDb } from "./server/db.ts";
import { sql } from "drizzle-orm";
import {
  isRazorpayWebhookEnabled,
  verifyRazorpayWebhook,
} from "./server/razorpay.ts";
import { getReadiness } from "./server/health.ts";

const app = express();
app.get(["/healthz", "/api/healthz"], (_req, res) => {
  res.status(200).json({ ok: true, service: "FleetOps API" });
});
app.get(["/readyz", "/api/readyz"], async (_req, res) => {
  const readiness = await getReadiness();
  res.status(readiness.ok ? 200 : 503).json(readiness);
});
app.post(
  "/api/razorpay/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    if (!isRazorpayWebhookEnabled()) {
      res.status(404).json({ error: "Webhook processing is disabled" });
      return;
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!verifyRazorpayWebhook(rawBody, req.header("x-razorpay-signature"))) {
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }
    const eventId = req.header("x-razorpay-event-id");
    if (!eventId || eventId.length > 200) {
      res.status(400).json({ error: "Missing or invalid webhook event id" });
      return;
    }
    let payload: {
      event?: string;
      payload?: { subscription?: { entity?: { notes?: { orgId?: string } } } };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      res.status(400).json({ error: "Invalid webhook JSON" });
      return;
    }
    const eventType = payload.event ?? "unknown";
    const recorded = await db.execute(
      sql.raw(
        `INSERT INTO "razorpay_webhook_events" ("event_id", "event_type") VALUES ('${eventId.replaceAll("'", "''")}', '${eventType.replaceAll("'", "''")}') ON CONFLICT ("event_id") DO NOTHING RETURNING "id"`
      )
    );
    if (!recorded.rows.length) {
      res.status(200).json({ received: true, eventId, duplicate: true });
      return;
    }
    const orgId = payload.payload?.subscription?.entity?.notes?.orgId;
    if (
      orgId &&
      [
        "subscription.activated",
        "subscription.charged",
        "subscription.pending",
        "subscription.halted",
      ].includes(payload.event ?? "")
    ) {
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
          paymentFailedAt:
            billingStatus === "PAYMENT_GRACE" ? new Date() : null,
          suspendedAt: billingStatus === "SUSPENDED" ? new Date() : null,
        },
      });
    }
    res
      .status(200)
      .json({
        received: true,
        eventId,
        mode: process.env.RAZORPAY_LIVE_ENABLED === "true" ? "LIVE" : "TEST",
      });
  }
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);

export default app;
