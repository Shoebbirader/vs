/**
 * Real-Time WebSocket Server
 * Manages live subscriptions for fleet status, work orders, and notifications
 */

import { WebSocketServer, WebSocket } from "ws";
import { Server as HTTPServer } from "node:http";
import { supabaseAdmin } from "./supabase";
import { fleetDb } from "./db";

export const REALTIME_PATH = "/ws";

/**
 * Verify JWT token and extract user info
 */
async function verifyToken(token: string): Promise<{ id: string; orgId: string }> {
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw error || new Error("User not found");
    
    const user = await fleetDb.user.findFirst({
      where: { id: data.user.id },
      select: { orgId: true },
    });
    const orgId =
      user?.orgId || (data.user.user_metadata?.orgId as string) || "";
    if (!orgId) throw new Error("Organization ID not found");
    
    return {
      id: data.user.id,
      orgId,
    };
  } catch (error) {
    console.error("[RT] Token verification failed:", error);
    throw error;
  }
}

/**
 * Subscription channels
 * Format: "namespace:id" (e.g., "vehicle:uuid", "org:uuid", "user:uuid")
 */
export const SUBSCRIPTIONS = {
  FLEET_STATUS: (orgId: string) => `fleet-status:${orgId}`,
  WORK_ORDER_UPDATES: (orgId: string) => `work-orders:${orgId}`,
  VEHICLE_HEALTH: (vehicleId: string) => `vehicle-health:${vehicleId}`,
  NOTIFICATION_FEED: (userId: string) => `notifications:${userId}`,
  COMPONENT_ALERTS: (vehicleId: string) => `components:${vehicleId}`,
};

interface RealtimeClient {
  userId: string;
  orgId: string;
  ws: WebSocket;
  subscriptions: Set<string>;
}

interface RealtimeMessage {
  type: "SUBSCRIBE" | "UNSUBSCRIBE" | "PING" | "BROADCAST";
  channel?: string;
  data?: unknown;
  timestamp: string;
}

/**
 * Real-Time WebSocket Server
 * Handles subscriptions and broadcasts to connected clients
 */
export class RealtimeServer {
  private wss: WebSocketServer;
  private clients: Map<string, RealtimeClient> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // channel -> clientIds

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
  }

  /**
   * Attach WebSocket server to HTTP server
   * Must be called during server initialization
   */
  attach(httpServer: HTTPServer): void {
    httpServer.on("upgrade", (request, socket, head) => {
      const pathname = new URL(
        request.url || "",
        `http://${request.headers.host || "localhost"}`
      ).pathname;
      if (pathname !== REALTIME_PATH) return;

      // Extract auth token from query string or headers
      const token = this.extractToken(request);

      if (!token) {
        socket.destroy();
        return;
      }

      // Verify token
      verifyToken(token)
        .then((user: any) => {
          this.wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
            this.handleConnection(ws, user, token);
          });
        })
        .catch(() => {
          socket.destroy();
        });
    });

    console.log("✓ Real-time WebSocket server attached");
  }

  /**
   * Extract JWT token from request
   */
  private extractToken(request: any): string | null {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const token = url.searchParams.get("token");
    if (token) return token;

    const authHeader = request.headers.authorization || "";
    const match = authHeader.match(/Bearer\s+(\S+)/);
    return match ? match[1] : null;
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, user: any, token: string): void {
    const clientId = crypto.randomUUID();
    const client: RealtimeClient = {
      userId: user.id,
      orgId: user.orgId,
      ws,
      subscriptions: new Set(),
    };

    this.clients.set(clientId, client);

    console.log(`[RT] Client connected: ${clientId} (user: ${user.id})`);

    // Handle incoming messages
    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as RealtimeMessage;
        this.handleMessage(clientId, client, message);
      } catch (error) {
        console.error("[RT] Failed to parse message:", error);
        ws.send(JSON.stringify({ error: "INVALID_MESSAGE" }));
      }
    });

    // Handle disconnect
    ws.on("close", () => {
      this.handleDisconnect(clientId, client);
    });

    // Handle errors
    ws.on("error", (error: Error) => {
      console.error("[RT] WebSocket error:", error);
      this.handleDisconnect(clientId, client);
    });

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: "CONNECTED",
        clientId,
        timestamp: new Date().toISOString(),
      })
    );
  }

  /**
   * Handle incoming messages from client
   */
  private handleMessage(clientId: string, client: RealtimeClient, message: RealtimeMessage): void {
    switch (message.type) {
      case "SUBSCRIBE":
        if (message.channel) {
          this.subscribe(clientId, client, message.channel);
        }
        break;

      case "UNSUBSCRIBE":
        if (message.channel) {
          this.unsubscribe(clientId, client, message.channel);
        }
        break;

      case "PING":
        client.ws.send(
          JSON.stringify({
            type: "PONG",
            timestamp: new Date().toISOString(),
          })
        );
        break;

      default:
        console.warn("[RT] Unknown message type:", message.type);
    }
  }

  /**
   * Subscribe client to a channel
   */
  private subscribe(clientId: string, client: RealtimeClient, channel: string): void {
    // Validate channel access
    if (!this.canAccessChannel(client, channel)) {
      client.ws.send(
        JSON.stringify({
          type: "ERROR",
          error: "UNAUTHORIZED",
          channel,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Add to subscriptions
    client.subscriptions.add(channel);
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(clientId);

    client.ws.send(
      JSON.stringify({
        type: "SUBSCRIBED",
        channel,
        timestamp: new Date().toISOString(),
      })
    );

    console.log(`[RT] Client ${clientId} subscribed to ${channel}`);
  }

  /**
   * Unsubscribe client from a channel
   */
  private unsubscribe(clientId: string, client: RealtimeClient, channel: string): void {
    client.subscriptions.delete(channel);
    this.subscriptions.get(channel)?.delete(clientId);

    client.ws.send(
      JSON.stringify({
        type: "UNSUBSCRIBED",
        channel,
        timestamp: new Date().toISOString(),
      })
    );

    console.log(`[RT] Client ${clientId} unsubscribed from ${channel}`);
  }

  /**
   * Validate that client can access a channel
   */
  private canAccessChannel(client: RealtimeClient, channel: string): boolean {
    // Extract resource type and id from channel name (e.g., "fleet-status:orgId")
    const [type, resource] = channel.split(":");

    if (!type || !resource) {
      return false;
    }

    // Fleet-level channels - check org access
    if (type === "fleet-status" || type === "work-orders") {
      return resource === client.orgId;
    }

    // User channels - check user ownership
    if (type === "notifications") {
      return resource === client.userId;
    }

    // Vehicle channels - check vehicle org ownership
    if (type === "vehicle-health" || type === "components") {
      // In production, verify vehicle belongs to org
      return true; // Simplified for now
    }

    return false;
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string, client: RealtimeClient): void {
    // Remove from all subscriptions
    for (const channel of Array.from(client.subscriptions)) {
      this.subscriptions.get(channel)?.delete(clientId);
    }

    this.clients.delete(clientId);
    console.log(`[RT] Client disconnected: ${clientId}`);
  }

  /**
   * Broadcast message to all subscribers of a channel
   */
  broadcast(channel: string, event: { type: string; data: unknown }): number {
    const clientIds = this.subscriptions.get(channel);
    if (!clientIds || clientIds.size === 0) {
      return 0;
    }

    let sent = 0;
    const message = JSON.stringify({
      type: "MESSAGE",
      channel,
      event,
      timestamp: new Date().toISOString(),
    });

    for (const clientId of Array.from(clientIds)) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
          sent += 1;
        } catch (error) {
          console.error(`[RT] Failed to send to ${clientId}:`, error);
        }
      }
    }

    return sent;
  }

  /**
   * Get real-time server statistics
   */
  stats(): { connectedClients: number; channels: number; subscriptions: number } {
    let subscriptionCount = 0;
    for (const clientIds of Array.from(this.subscriptions.values())) {
      subscriptionCount += clientIds.size;
    }

    return {
      connectedClients: this.clients.size,
      channels: this.subscriptions.size,
      subscriptions: subscriptionCount,
    };
  }
}

// Global instance
export const realtimeServer = new RealtimeServer();

/**
 * Event integration: Publish events to real-time subscribers
 * Called from event handlers to push updates to connected clients
 */
export function publishRealtimeEvent(channel: string, event: { type: string; data: unknown }): void {
  const sent = realtimeServer.broadcast(channel, event);
  if (sent > 0) {
    console.log(`[RT] Broadcast to ${sent} clients on channel: ${channel}`);
  }
}

/**
 * Publish work order update to fleet subscribers
 */
export function publishWorkOrderUpdate(orgId: string, workOrder: any): void {
  publishRealtimeEvent(SUBSCRIPTIONS.WORK_ORDER_UPDATES(orgId), {
    type: "WORK_ORDER_UPDATED",
    data: {
      id: workOrder.id,
      status: workOrder.status,
      priority: workOrder.priority,
      vehicle: workOrder.vehicle?.licensePlate || workOrder.vehicleId,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * Publish vehicle health update
 */
export function publishVehicleHealthUpdate(vehicleId: string, health: any): void {
  publishRealtimeEvent(SUBSCRIPTIONS.VEHICLE_HEALTH(vehicleId), {
    type: "VEHICLE_HEALTH_UPDATED",
    data: {
      vehicleId,
      status: health.status,
      maintenanceDue: health.maintenanceDue,
      components: health.components,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * Publish fleet status update (aggregated metrics)
 */
export function publishFleetStatusUpdate(orgId: string, metrics: any): void {
  publishRealtimeEvent(SUBSCRIPTIONS.FLEET_STATUS(orgId), {
    type: "FLEET_STATUS_UPDATED",
    data: {
      activeVehicles: metrics.activeVehicles,
      totalVehicles: metrics.totalVehicles,
      openWorkOrders: metrics.openWorkOrders,
      slaViolations: metrics.slaViolations,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * Publish notification to user
 */
export function publishNotification(userId: string, notification: any): void {
  publishRealtimeEvent(SUBSCRIPTIONS.NOTIFICATION_FEED(userId), {
    type: "NOTIFICATION_RECEIVED",
    data: {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      severity: notification.severity,
      type: notification.type,
      createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
    },
  });
}

/**
 * Publish component alert to vehicle subscribers
 */
export function publishComponentAlert(vehicleId: string, component: any, alert: any): void {
  publishRealtimeEvent(SUBSCRIPTIONS.COMPONENT_ALERTS(vehicleId), {
    type: "COMPONENT_ALERT",
    data: {
      componentId: component.id,
      componentName: component.name,
      alertType: alert.type,
      severity: alert.severity,
      message: alert.message,
      createdAt: new Date().toISOString(),
    },
  });
}
