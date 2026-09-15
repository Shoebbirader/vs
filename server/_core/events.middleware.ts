import { Express } from "express";
import { eventBus, setupEventHandlers } from "../events";

let handlersAttached = false;

/**
 * Attach event system to Express app
 * Makes event bus available to all request handlers via app.locals
 */
export function attachEventHandlers(app: Express) {
  // Initialize event handlers
  if (!handlersAttached) {
    setupEventHandlers();
    handlersAttached = true;
  }

  // Store event bus in app locals so routers can access it
  app.locals.eventBus = eventBus;

  // Optional: Add event log endpoint for debugging (remove in production)
  if (process.env.NODE_ENV !== "production") {
    app.get("/_debug/events", (req, res) => {
      const log = eventBus.getLog();
      res.json({
        totalEvents: log.length,
        lastEvents: log.slice(-10).map((entry) => ({
          event: entry.event.type,
          timestamp: entry.timestamp,
          success: entry.success,
          error: entry.error
        }))
      });
    });
  }

  console.log("✓ Event system attached to Express app");
}
