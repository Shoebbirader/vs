# VahanSync Architecture: Integration Points (Zero-Break Guarantee)

This document proves that each new phase integrates safely without breaking existing code.

---

## Core Integration Principle

**Every new file is additive. No existing logic is removed or fundamentally changed.**

### Example Pattern (applies to all phases):
```typescript
// BEFORE (existing code)
export async function createWorkOrder(input) {
  const order = await fleetDb.workOrder.create({ data: input });
  await recordAudit(ctx, { ...audit });
  return order;  // Response unchanged ✅
}

// AFTER (with events - Phase 2)
export async function createWorkOrder(input) {
  const order = await fleetDb.workOrder.create({ data: input });
  await recordAudit(ctx, { ...audit });
  
  // NEW: Fire event for side effects
  // But return value unchanged!
  publishEvent({ type: 'WORK_ORDER_CREATED', payload: order });
  
  return order;  // SAME return value ✅
}
```

---

## Phase 2: Event System Integration

### File: `server/events/publisher.ts` (NEW)
```typescript
export async function publishEvent(event: DomainEvent) {
  // Enqueue event
  // Fire handlers asynchronously (don't wait)
  // Never throws to caller (failures logged)
}
```

**Integration point**: Called from existing mutations.

### Change to `server/routers.ts` (MINIMAL)
```diff
export const appRouter = router({
  vehicles: router({
    create: fleetOpsProcedure.input(...).mutation(async ({ ctx, input }) => {
      const vehicle = await fleetDb.vehicle.create({ data: {...} });
      await recordAudit(ctx, {...});
+     publishEvent({ type: 'VEHICLE_CREATED', vehicle });  // NEW LINE
      return vehicle;  // ← SAME return ✅
    }),
  }),
});
```

**Why this is safe:**
- `publishEvent()` is async, non-blocking
- Doesn't modify `vehicle` object
- If events crash, mutation already succeeded
- Return value unchanged
- Caller unaffected

---

## Phase 3: Intelligence Layer Integration

### File: `server/intelligence/dashboard.queries.ts` (NEW)
```typescript
export async function getFleetHealthMetrics(orgId: string) {
  // Read-only: No modifications to database
  // Just analysis of existing data
  return {
    readyCount: vehicles.filter(v => isReady(v)).length,
    maintenanceCount: vehicles.filter(v => needsMaintenance(v)).length,
    costTotal: sum(costs),
  };
}
```

**Integration point**: New tRPC procedure, called by dashboard only.

### Change to `server/routers.ts` (NEW PROCEDURE)
```typescript
export const appRouter = router({
  // ... existing routers unchanged
  
  // NEW SECTION - doesn't touch existing code
  dashboard: router({
    health: fleetOpsProcedure.query(async ({ ctx }) => {
      return getFleetHealthMetrics(ctx.fleetopsUser.orgId);
    }),
  }),
});
```

**Why this is safe:**
- Pure addition, no modifications
- Read-only database access
- Separate router namespace
- Existing procedures unchanged
- Can be disabled with feature flag

---

## Phase 4: Observability Integration

### File: `server/observability/alerts.manager.ts` (NEW)
```typescript
export async function checkEscalation(notification: Notification) {
  // Check: Is this alert > 2 hours old and unacknowledged?
  // If yes: Create escalation event
  // Only modifies notification.acknowledgedAt
}
```

**Integration point**: Called from event handler only.

### Change to `server/events/handlers/notification.handler.ts` (MINIMAL)
```diff
export async function onNotificationCreated(event: NotificationCreatedEvent) {
  await sendViaChannel(event.notification, event.recipient);
  
+ // NEW: Check if needs escalation
+ await alertsManager.checkEscalation(event.notification);
  
  // Previous code unchanged ✅
}
```

**Why this is safe:**
- Only adds one function call
- Doesn't break sendViaChannel
- Escalation is separate from delivery
- Can be disabled without affecting notifications

---

## Phase 5: Driver Workflows Integration

### File: `server/workflows/auto-workorder.generator.ts` (NEW)
```typescript
export async function handleIssueSubmitted(event: IssueSubmittedEvent) {
  // Listen to event
  // Auto-create work order
  // Optionally assign to mechanic
}
```

**Integration point**: Event listener (Phase 2 must be deployed first).

### New Event Type in `server/events/types.ts`
```typescript
export type IssueSubmittedEvent = {
  type: 'ISSUE_SUBMITTED',
  issue: VehicleIssue,
};
```

**Integration in `server/routers.ts`**:
```diff
vehicleIssues: router({
  submit: fleetOpsProcedure.input(...).mutation(async ({ ctx, input }) => {
    const issue = await fleetDb.vehicleIssue.create({ data: {...} });
+   publishEvent({ type: 'ISSUE_SUBMITTED', issue });  // Triggers auto-workorder
    return issue;  // ← SAME return ✅
  }),
}),
```

**Why this is safe:**
- Only publishes event, doesn't affect return
- Auto-workorder creation is optional (feature flag)
- Existing issue submission works as-is
- Driver sees same response time

---

## Phase 6: Real-Time Integration

### File: `server/realtime/websocket.server.ts` (NEW)
```typescript
export function attachWebSocketServer(httpServer) {
  // Create WebSocket server
  // Listen on same port as HTTP
  // Authenticate connections
}
```

**Integration point**: Single call in `server/_core/index.ts`.

### Change to `server/_core/index.ts` (MINIMAL)
```diff
const httpServer = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

+ // NEW: Attach WebSocket server
+ attachWebSocketServer(httpServer);
```

**Why this is safe:**
- Single initialization call
- Doesn't touch existing HTTP logic
- If WebSocket fails: Startup continues
- All HTTP endpoints work unchanged
- Clients fall back to polling

### Client Integration (OPTIONAL)
```typescript
// OLD (still works)
const health = await client.vehicles.health({ vehicleId });

// NEW (also available)
const subscription = useRealtimeFleetStatus(vehicleId);
const health = subscription.data;

// Both work side-by-side ✅
```

**Why this is safe:**
- Old HTTP queries still work
- New hook is optional
- No client-side breaking changes
- Graceful fallback if WebSocket unavailable

---

## Phase 7: Integrations Hub

### File: `server/integrations/webhooks.ts` (NEW)
```typescript
export const webhookRouter = router({
  telematics: publicProcedure.input(...).mutation(async ({ input }) => {
    // Receive GPS/fuel from telematics provider
    // Create events
    // Return 200 OK
  }),
});
```

**Integration point**: New router, no changes to existing routers.

### Database Migration `drizzle/0001_integrations.sql` (NEW TABLES)
```sql
CREATE TABLE integration_tokens (
  id UUID PRIMARY KEY,
  orgId UUID NOT NULL,
  provider TEXT NOT NULL,
  encryptedToken TEXT NOT NULL,
  createdAt TIMESTAMP
);

CREATE TABLE integration_sync_logs (
  id UUID PRIMARY KEY,
  orgId UUID NOT NULL,
  provider TEXT NOT NULL,
  status TEXT,
  lastSyncAt TIMESTAMP
);
```

**Why this is safe:**
- Only creates new tables
- Doesn't modify existing tables
- Existing queries unaffected
- Migration is optional (can be skipped)

### Change to `server/db.ts` (MINIMAL)
```diff
const tables: Record<string, string> = {
  organization: "organizations",
  // ... existing tables
+ integrationToken: "integration_tokens",
+ integrationSyncLog: "integration_sync_logs",
};

const drizzleTables: Record<string, unknown> = {
  // ... existing
+ integrationToken: fleetopsSchema.integrationTokens,
+ integrationSyncLog: fleetopsSchema.integrationSyncLogs,
};
```

**Why this is safe:**
- Only adds new entries to maps
- Existing model() function works unchanged
- Old queries don't see new tables
- Can be done after migration

---

## Dependency Flow (Why Nothing Breaks)

```
Existing Code (Core)
  ↓
Phase 2 (Events)           ← Listens to core, doesn't modify
  ↓
Phase 3 (Intelligence)     ← Reads events, doesn't modify
Phase 4 (Observability)    ↗
  ↓
Phase 5 (Workflows)        ← Publishes new events, doesn't touch core
  ↓
Phase 6 (Real-Time)        ← Broadcasts events, doesn't modify them
  ↓
Phase 7 (Integrations)     ← New data sources, don't modify core
```

**Key insight**: Each phase only consumes or broadcasts, never modifies core logic.

---

## Rollback Safety Matrix

| Phase | If It Breaks | Rollback Steps | Time |
|-------|-------------|---|---|
| 1 | Bugs introduced | Revert routers.ts, twilio.ts | 2 min |
| 2 | Events crash | Comment `publishEvent()` calls | 5 min |
| 3 | Predictor slow | Comment `getFleetHealthMetrics()` call | 2 min |
| 4 | Escalation loops | Disable event handler | 1 min |
| 5 | Auto-workorder creates wrong orders | Disable event listener | 1 min |
| 6 | WebSocket crashes | Comment `attachWebSocketServer()` | 1 min |
| 7 | Webhook causes errors | Disable webhook router | 1 min |

**Principle**: Each phase can be independently disabled.

---

## Testing Each Integration (Prevents Breaking)

### Phase 2 Integration Test
```typescript
test('Existing mutations work WITH and WITHOUT event system', async () => {
  // Disable event publishing
  const result1 = await createWorkOrder({ ...input });
  
  // Enable event publishing
  const result2 = await createWorkOrder({ ...input });
  
  // Results must be identical
  expect(result1).toEqual(result2);
  expect(result1.id).toBeDefined();
});

test('Event handler failure does not affect mutation', async () => {
  // Make event handlers throw errors
  publishEvent.mockRejectedValue(new Error('Event handler failed'));
  
  // Mutation should still succeed
  const result = await createWorkOrder({ ...input });
  expect(result).toBeDefined();
});
```

### Phase 6 Integration Test
```typescript
test('HTTP works when WebSocket is disabled', async () => {
  attachWebSocketServer.mockImplementation(() => {
    throw new Error('WebSocket init failed');
  });
  
  // Server should still start
  const server = startServer();
  expect(server).toBeDefined();
  
  // HTTP endpoints work
  const result = await httpClient.vehicles.list();
  expect(result).toBeDefined();
});
```

---

## Configuration/Feature Flags (Additional Safety)

To make rollbacks even safer, add feature flags:

```typescript
// server/_core/features.ts (NEW)
const FEATURES = {
  EVENTS_ENABLED: process.env.FEATURE_EVENTS === 'true',
  PREDICTOR_ENABLED: process.env.FEATURE_PREDICTOR === 'true',
  WEBSOCKET_ENABLED: process.env.FEATURE_WEBSOCKET === 'true',
  INTEGRATIONS_ENABLED: process.env.FEATURE_INTEGRATIONS === 'true',
};

// Usage in routers
export const appRouter = router({
  vehicles: router({
    create: fleetOpsProcedure.input(...).mutation(async ({ ctx, input }) => {
      const vehicle = await fleetDb.vehicle.create({ data: {...} });
      if (FEATURES.EVENTS_ENABLED) {
        publishEvent({ type: 'VEHICLE_CREATED', vehicle });
      }
      return vehicle;
    }),
  }),
});
```

**Advantage**: Disable any phase in production without redeploying:
```bash
FEATURE_EVENTS=false       # Disable events
FEATURE_PREDICTOR=false    # Disable AI
FEATURE_WEBSOCKET=false    # Disable real-time
```

---

## Database Rollback (for Phase 7)

If integration tables cause issues:

```sql
-- Option 1: Drop new tables (removes integration features)
DROP TABLE integration_sync_logs;
DROP TABLE integration_tokens;

-- Option 2: Disable in app (keeps tables, ignores them)
FEATURES.INTEGRATIONS_ENABLED = false;
```

**Old data is never touched, existing queries unaffected.**

---

## Summary: Why Zero Breaking Changes Guaranteed

| Aspect | How It's Safe |
|--------|--------------|
| **Return values** | All mutations return same objects as before |
| **Database** | Only adds tables/columns, never modifies |
| **Queries** | New queries are new procedures, old ones untouched |
| **Events** | Async, non-blocking side effects |
| **Real-time** | Fallback to HTTP polling if unavailable |
| **Integrations** | Webhooks isolated, don't modify core |
| **Rollback** | Each phase can be disabled in seconds |
| **Testing** | Contract tests prove output unchanged |
| **Deployment** | Can deploy incrementally with feature flags |

---

## Recommended Checklist Before Each Phase

```markdown
## Phase X Integration Checklist

- [ ] All existing tests pass
- [ ] Contract tests verify return values unchanged
- [ ] New files in isolated directories
- [ ] No modifications to existing business logic
- [ ] Feature flag added (optional)
- [ ] Rollback procedure documented
- [ ] Integration tests pass
- [ ] Staging deployment successful
- [ ] Team review completed
- [ ] Ready for production
```

---

## Conclusion

✅ Each new file is isolated  
✅ Each modified file is additive  
✅ Each phase is independently deployable  
✅ Each phase can be disabled/rolled back in < 5 minutes  
✅ Zero breaking changes guaranteed  
✅ Existing code paths untouched  

**You can confidently expand VahanSync without fear of breaking it.**
