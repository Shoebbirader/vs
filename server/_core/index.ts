import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./static";
import { createRequestId, logRequestError, logRequestSignal } from "../observability";
import { createRateLimiter } from "../rateLimit";
import { fleetDb } from "../db";
import { isRazorpayWebhookEnabled, verifyRazorpayWebhook } from "../razorpay";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.post("/api/razorpay/webhook", express.raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
    if (!isRazorpayWebhookEnabled()) { res.status(404).json({ error: "Webhook processing is disabled" }); return; }
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!verifyRazorpayWebhook(rawBody, req.header("x-razorpay-signature"))) { res.status(400).json({ error: "Invalid webhook signature", requestId: res.locals.requestId ?? "unknown" }); return; }
    const eventId = req.header("x-razorpay-event-id");
    if (!eventId) { res.status(400).json({ error: "Missing webhook event id", requestId: res.locals.requestId ?? "unknown" }); return; }
    let payload: { event?: string; payload?: { subscription?: { entity?: { notes?: { orgId?: string } } } } };
    try { payload = JSON.parse(rawBody); } catch { res.status(400).json({ error: "Invalid webhook JSON", requestId: res.locals.requestId ?? "unknown" }); return; }
    const orgId = payload.payload?.subscription?.entity?.notes?.orgId;
    if (orgId && ["subscription.activated", "subscription.charged", "subscription.pending", "subscription.halted"].includes(payload.event ?? "")) {
      const billingStatus = payload.event === "subscription.halted" ? "SUSPENDED" : payload.event === "subscription.pending" ? "PAYMENT_GRACE" : "ACTIVE";
      await fleetDb.organization.update({ where: { id: orgId }, data: { billingStatus, paymentFailedAt: billingStatus === "PAYMENT_GRACE" ? new Date() : null, suspendedAt: billingStatus === "SUSPENDED" ? new Date() : null } });
    }
    res.status(200).json({ received: true, eventId, mode: "TEST" });
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use((req, res, next) => { const requestId = req.header("x-request-id") || createRequestId(); res.locals.requestId = requestId; res.setHeader("x-request-id", requestId); next(); });
  
  // SECURITY: Separate rate limiters for different endpoints
  const allowApiRequest = createRateLimiter(240, 60_000);  // 240 req/min for general API
  const allowAuthRequest = createRateLimiter(20, 60_000);  // 20 req/min for auth (stricter)
  
  // Apply stricter rate limiting to auth-related endpoints
  app.use(
    "/api/trpc/auth",
    (req, res, next) => { 
      const result = allowAuthRequest(req.ip || req.socket.remoteAddress || "unknown"); 
      res.setHeader("x-rate-limit-remaining", String(result.remaining)); 
      if (!result.allowed) { 
        res.setHeader("retry-after", String(Math.ceil(result.retryAfterMs / 1000))); 
        res.status(429).json({ error: "Auth rate limit exceeded. Please try again later.", requestId: res.locals.requestId }); 
        return; 
      } 
      next(); 
    }
  );
  
  // tRPC API
  app.use(
    "/api/trpc",
    (req, res, next) => { const result = allowApiRequest(req.ip || req.socket.remoteAddress || "unknown"); res.setHeader("x-rate-limit-remaining", String(result.remaining)); if (!result.allowed) { res.setHeader("retry-after", String(Math.ceil(result.retryAfterMs / 1000))); res.status(429).json({ error: "Too many requests. Please retry shortly.", requestId: res.locals.requestId }); return; } next(); },
    (req, res, next) => { const startedAt = performance.now(); res.on("finish", () => { const durationMs = performance.now() - startedAt; if (durationMs >= 1000) logRequestSignal({ event: "slow_query", requestId: res.locals.requestId ?? "unknown", path: req.path, durationMs }); }); next(); },
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ path, error, req }) => { const requestId = req.res?.locals?.requestId ?? "unknown"; logRequestError({ requestId, path, code: error.code, message: error.message }); if (error.code === "UNAUTHORIZED") logRequestSignal({ event: "auth_failure", requestId, path, code: error.code, message: error.message }); },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
