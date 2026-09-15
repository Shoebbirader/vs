import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./server/routers.ts";
import { createContext } from "./server/_core/context.ts";
import { processRazorpayWebhook } from "./server/razorpay.ts";
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
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const result = await processRazorpayWebhook({
      rawBody,
      signature: req.header("x-razorpay-signature"),
      eventId: req.header("x-razorpay-event-id"),
    });
    res.status(result.status).json(result.body);
  }
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);

export default app;
