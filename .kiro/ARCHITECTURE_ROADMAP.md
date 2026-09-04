# VahanSync Architecture Roadmap: New Files & Integration Plan

## Overview
This document details EXACTLY which new files will be created for each enhancement phase, how they integrate with existing code, and what NO-BREAK guarantees we have.

---

## Phase 1: Fix 7 Bugs (CURRENT - 0 new files)
**Status**: Fixing existing files only
- `server/routers.ts` - Fix bugs #1, #2, #4, #5, #7
- `server/twilio.ts` - Fix bug #3 (needs type fix)
- **No new files created**
- **No breaking changes** - All fixes are additive or filtering improvements

---

## Phase 2: Event-Driven Architecture (2-4 weeks)

### New Files: 8 total

#### Core Event System (3 files)
1. **`server/events/types.ts`** (150 lines)
   - Define all domain events (`WorkOrderCompletedEvent`, `VehicleMaintenanceEvent`, etc.)
   - Type-safe event schema with Zod
   - Location: New directory `server/events/`
   - **Integration**: Zero breaking changes - purely additive types

2. **`server/events/publisher.ts`** (80 lines)
   - Central event bus using in-memory queue
   - `publishEvent(event: DomainEvent)` function
   - Async handler registration
   - **Integration**: Optional - mutations can keep working without publishing initially

3. **`server/events/handlers/index.ts`** (50 lines)
   - Export all event handler registrations
   - Single place to see all side effects
   - **Integration**: Called once at server startup, doesn't affect existing code

#### Event Handlers (4 files)
4. **`server/events/handlers/maintenance.handler.ts`** (120 lines)
   - Listens for `WorkOrderCompleted` event
   - Updates component `lastServicedOdometer`
   - Triggers maintenance evaluation
   - **Integration**: Read-only listener - existing work order logic untouched

5. **`server/events/handlers/inventory.handler.ts`** (100 lines)
   - Listens for `PartsUsedEvent`
   - Creates inventory movements
   - Triggers reorder checks
   - **Integration**: Read-only listener - existing inventory untouched

6. **`server/events/handlers/notification.handler.ts`** (90 lines)
   - Listens for maintenance/alert events
   - Replaces scattered notification calls
   - **Integration**: Centralizes existing notification logic, doesn't break it

7. **`server/events/handlers/audit.handler.ts`** (60 lines)
   - Listens for all events
   - Creates audit records
   - **Integration**: Replaces manual `recordAudit()` calls gradually

#### Implementation File
8. **`server/events/setup.ts`** (40 lines)
   - Initializes event handlers on server startup
   - Dead letter queue logging
   - Error handling
   - **Integration**: Called from `server/_core/index.ts` at startup

### Changes to Existing Files (3 files affected)

**`server/_core/index.ts`**
- Add: `import { setupEventHandlers } from '../events/setup'`
- Add: `setupEventHandlers()` in initialization
- **Breaking?** NO - Purely additive

**`server/routers.ts`** (selective refactoring - NOT all at once)
- Add: `import { publishEvent } from '../events/publisher'`
- Mutations: Call `publishEvent()` after creating entity (e.g., after `workOrder.create()`)
- **Breaking?** NO - Events are published in parallel, don't block mutation response
- **Rollback?** Easy - just comment out publish calls

**`server/twilio.ts`**
- Notification handler will eventually replace this
- Can keep existing code - handler just calls same functions
- **Breaking?** NO - Gradual migration

### Test Files (not counted in "new files" requirement but mentioned)
- `server/events/types.test.ts` - Type safety tests
- `server/events/publisher.test.ts` - Event bus tests
- `server/events/handlers/*.test.ts` - Handler tests
- These are optional until you want comprehensive coverage

---

## Phase 3: Intelligence Layer (3-6 weeks)

### New Files: 6 total

#### Predictive Maintenance (3 files)
1. **`server/intelligence/maintenance.predictor.ts`** (180 lines)
   - Analyzes component lifecycle patterns
   - Predicts next maintenance need
   - Returns: `{ dueDate: Date, confidenceScore: 0-1 }`
   - **Integration**: Called by maintenance event handler, no breaking changes

2. **`server/intelligence/anomaly.detector.ts`** (150 lines)
   - Detects unusual patterns:
     - Odometer jumps > threshold
     - Fuel consumption spikes
     - Idle vehicle alerts
   - **Integration**: Called by scheduled job, creates notifications via event bus

3. **`server/intelligence/dashboard.queries.ts`** (200 lines)
   - Pre-computed aggregations for dashboards
   - `getFleetHealthMetrics(orgId)`, `getCostBreakdown(vehicleId)`, etc.
   - Caches results in memory (upgradeable to Redis later)
   - **Integration**: New tRPC procedure, no impact on existing queries

#### Cost Analysis (2 files)
4. **`server/intelligence/cost.analyzer.ts`** (120 lines)
   - Calculate per-vehicle, per-driver, per-route costs
   - Group by category (fuel, maintenance, labor, parts)
   - **Integration**: Called by dashboard, no breaking changes

5. **`server/intelligence/cost.allocator.ts`** (100 lines)
   - Assign costs to cost centers (routes, depots, drivers)
   - Used for financial reporting
   - **Integration**: Optional - reads financial_records, doesn't modify

#### Infrastructure (1 file)
6. **`server/intelligence/cache.ts`** (80 lines)
   - Simple in-memory cache with TTL
   - Upgradeable to Redis
   - `cache.get()`, `cache.set()`, `cache.invalidate()`
   - **Integration**: Used by dashboard queries, doesn't affect existing code

### Changes to Existing Files (2 files affected)

**`server/events/handlers/maintenance.handler.ts`**
- Add: Import predictor
- After updating component: Call `predictor.nextMaintenanceDate(component)`
- Store prediction in memory cache
- **Breaking?** NO - Additive only

**`client/src/components/workspaces/FleetManagerOverviewWorkspace.tsx`** (existing file)
- Add new tab: "Insights" (dashboard with predictive data)
- Existing tabs unchanged
- **Breaking?** NO - New feature, existing features intact

---

## Phase 4: Observability & Alerting (3-4 weeks)

### New Files: 4 total

1. **`server/observability/sla.tracker.ts`** (120 lines)
   - Tracks work order age, alert aging
   - Calculates violations
   - **Integration**: New tRPC procedure for SLA dashboard

2. **`server/observability/metrics.collector.ts`** (100 lines)
   - Fleet health metrics (% ready, avg age of work orders)
   - Vehicles by status distribution
   - **Integration**: Called by dashboard, read-only

3. **`server/observability/alerts.manager.ts`** (150 lines)
   - Escalation logic: critical alert unread for 2h → notify manager
   - Alert deduplication
   - **Integration**: Event handler subscribes to this

4. **`server/observability/webhooks.ts`** (80 lines)
   - Optional: Send metrics to external services (DataDog, New Relic)
   - **Integration**: Optional feature, completely isolated

### Changes to Existing Files (1 file)

**`server/events/handlers/notification.handler.ts`**
- Add: Call `alertsManager.checkEscalation()` after sending notification
- **Breaking?** NO - Only escalates unacknowledged alerts

---

## Phase 5: Driver Workflow Enhancement (2-3 weeks)

### New Files: 5 total

1. **`server/workflows/driver.workflows.ts`** (180 lines)
   - Pre-trip checklist builder
   - Issue submission workflow
   - Fuel log submission workflow
   - **Integration**: New tRPC procedures, existing data unchanged

2. **`server/workflows/driver.state.ts`** (100 lines)
   - Track: "driver has submitted pre-trip", "vehicle assigned", "issue awaiting review"
   - State machine: When valid transitions occur
   - **Integration**: No database changes, computed from existing data

3. **`client/src/components/DriverPreTripChecklist.tsx`** (200 lines)
   - React component for pre-trip workflow
   - Uses tRPC procedures from driver.workflows.ts
   - **Integration**: New feature UI, doesn't modify existing components

4. **`client/src/components/DriverIssueSubmission.tsx`** (180 lines)
   - Form for submitting vehicle issues
   - Auto-creates work order
   - **Integration**: New component, existing issues flow unchanged

5. **`server/workflows/auto-workorder.generator.ts`** (100 lines)
   - When driver submits issue → auto-creates work order
   - Assigns to available mechanic if high priority
   - **Integration**: Event listener on "IssueSubmitted" event

### Changes to Existing Files (2 files)

**`server/events/types.ts`**
- Add: `IssueSubmittedEvent` type
- **Breaking?** NO - Only adding new event type

**`client/src/components/workspaces/DriverWorkspace.tsx`**
- Add: New section "Pre-Trip Checklist" and "Report Issues"
- Existing sections (odometer, fuel log) unchanged
- **Breaking?** NO - Additive

---

## Phase 6: Real-Time Connectivity (4-6 weeks)

### New Files: 6 total

1. **`server/realtime/websocket.server.ts`** (200 lines)
   - WebSocket connection manager
   - Room-based subscriptions (fleet updates, vehicle updates)
   - **Integration**: Parallel to existing REST API, doesn't affect it

2. **`server/realtime/subscriptions.ts`** (150 lines)
   - Define subscription types: fleet status, work order updates, vehicle health
   - **Integration**: Event handler publishes to subscribers

3. **`server/realtime/auth.middleware.ts`** (80 lines)
   - Authenticate WebSocket connections
   - Scope subscriptions by organization
   - **Integration**: Reuses existing auth logic

4. **`server/_core/websocket.ts`** (120 lines) - *replaces part of index.ts*
   - Attach WebSocket to Express server
   - **Integration**: Called from index.ts during initialization

5. **`client/src/hooks/useSubscription.ts`** (100 lines)
   - React hook for subscribing to real-time updates
   - Fallback to polling if WebSocket unavailable
   - **Integration**: New hook, existing queries work as-is

6. **`client/src/hooks/useRealtimeFleetStatus.ts`** (80 lines)
   - Pre-built hook for fleet status updates
   - Similar hooks for work orders, vehicles
   - **Integration**: Composable, optional - use or don't

### Changes to Existing Files (3 files)

**`server/_core/index.ts`**
- Add: `attachWebSocketServer(httpServer)` call
- **Breaking?** NO - Additive initialization

**`package.json`**
- Add: `"ws": "^8.x"` dependency
- **Breaking?** NO - New dependency only

**`client/src/App.tsx`** (if using subscription)
- Wrap app with `<RealtimeProvider>`
- **Breaking?** NO - Optional provider, all existing code works without it

---

## Phase 7: Integration Hub (6-8 weeks)

### New Files: 8 total

1. **`server/integrations/telematics.adapter.ts`** (200 lines)
   - Abstract interface for GPS/telematics systems
   - Ingest vehicle location, fuel, odometer
   - **Integration**: Webhook endpoint, creates events

2. **`server/integrations/government.adapter.ts`** (150 lines)
   - Verify vehicle registration (RC number)
   - Check permit validity
   - **Integration**: Called on-demand by fleet manager, read-only

3. **`server/integrations/insurance.adapter.ts`** (120 lines)
   - Sync policy dates
   - Check coverage for vehicles
   - **Integration**: Scheduled sync daily, creates alerts if expired

4. **`server/integrations/tax.adapter.ts`** (180 lines)
   - GST filing templates
   - Calculate monthly returns
   - **Integration**: Read-only, generates export for CA

5. **`server/integrations/fuel.adapter.ts`** (100 lines)
   - Connect to fuel vendor APIs
   - Auto-reconcile fuel logs
   - **Integration**: Webhook ingest, creates movements

6. **`server/integrations/bank.adapter.ts`** (90 lines)
   - Connect to bank APIs for payment reconciliation
   - **Integration**: Webhook ingest, matches financial records

7. **`server/integrations/webhooks.ts`** (150 lines)
   - Unified webhook receiver for all integrations
   - Route to correct adapter
   - Retry logic
   - **Integration**: New tRPC procedure for webhook, isolated

8. **`server/integrations/auth.tokens.ts`** (80 lines)
   - Securely store API tokens for integrations
   - Encrypted in database
   - **Integration**: Stored in new table `integration_tokens`, doesn't affect existing

### Database Changes (1 migration)
- **`drizzle/0001_integrations.sql`** (30 lines)
  - New table: `integration_tokens` (orgId, provider, encryptedToken)
  - New table: `integration_sync_logs` (provider, status, lastSyncAt)
  - **Breaking?** NO - Pure additions, no schema changes to existing tables

### Changes to Existing Files (2 files)

**`server/db.ts`**
- Add: integrationTokens and integrationSyncLogs to model mapping
- **Breaking?** NO - Additive

**`client/src/components/workspaces/OrganizationSettingsWorkspace.tsx`**
- Add: New "Integrations" section
- Existing sections unchanged
- **Breaking?** NO - Additive

---

## Summary Table

| Phase | Phase Name | New Files | Modified Files | Breaking Changes? | Time |
|-------|-----------|-----------|-----------------|-------------------|------|
| 1 | Bug Fixes | 0 | 2 | NO | 1 day |
| 2 | Events | 8 | 3 | NO | 2-4 wks |
| 3 | Intelligence | 6 | 2 | NO | 3-6 wks |
| 4 | Observability | 4 | 1 | NO | 3-4 wks |
| 5 | Driver UX | 5 | 2 | NO | 2-3 wks |
| 6 | Real-Time | 6 | 3 | NO | 4-6 wks |
| 7 | Integrations | 8 | 2 | NO | 6-8 wks |
| **TOTAL** | **All Phases** | **37 files** | **15 files** | **NONE** | **21-34 wks** |

---

## No-Break Guarantees

### Why Zero Breaking Changes?

1. **New features are additive**
   - New files don't modify existing files' logic
   - New tRPC procedures don't change existing ones
   - New event handlers work in parallel

2. **Event system is opt-in**
   - Mutations work with OR without event publishing
   - Can gradually move side effects to handlers
   - If event system fails, sync path still works

3. **New UI components don't touch old ones**
   - New dashboards are new routes/tabs
   - New forms are new components
   - Existing workspaces left untouched

4. **Database changes are backward compatible**
   - Only adding tables/columns, never dropping
   - Existing queries work without seeing new data
   - Old code can coexist with new

5. **Client changes are non-blocking**
   - New hooks are optional
   - WebSocket is fallback to HTTP
   - Existing queries continue to work

### Rollback Strategy

If any phase breaks something:

```
Phase 2 Event System fails?
→ Comment out publishEvent() calls in routers.ts
→ Existing sync logic still works
→ Took 5 minutes to revert

Phase 6 WebSocket breaks?
→ Comment out WebSocket initialization in _core/index.ts
→ HTTP polling still works
→ No client-side changes needed
```

---

## Recommended Rollout Sequence

1. **Fix 7 bugs** (done first)
2. **Phase 2 (Events)** - Foundation for all other phases
3. **Phase 3 (Intelligence)** - High-value feature, uses events
4. **Phase 4 (Observability)** - Uses events and intelligence
5. **Phase 5 (Driver UX)** - Independent feature
6. **Phase 6 (Real-Time)** - Enhances all existing features
7. **Phase 7 (Integrations)** - Premium feature, doesn't block others

---

## File Location Structure

```
server/
├── _core/
│   ├── index.ts (modified)
│   ├── websocket.ts (new in Phase 6)
│   └── ...
├── events/ (Phase 2)
│   ├── types.ts
│   ├── publisher.ts
│   ├── setup.ts
│   └── handlers/
│       ├── index.ts
│       ├── maintenance.handler.ts
│       ├── inventory.handler.ts
│       ├── notification.handler.ts
│       └── audit.handler.ts
├── intelligence/ (Phase 3)
│   ├── maintenance.predictor.ts
│   ├── anomaly.detector.ts
│   ├── dashboard.queries.ts
│   ├── cost.analyzer.ts
│   ├── cost.allocator.ts
│   └── cache.ts
├── observability/ (Phase 4)
│   ├── sla.tracker.ts
│   ├── metrics.collector.ts
│   ├── alerts.manager.ts
│   └── webhooks.ts
├── workflows/ (Phase 5)
│   ├── driver.workflows.ts
│   ├── driver.state.ts
│   └── auto-workorder.generator.ts
├── realtime/ (Phase 6)
│   ├── websocket.server.ts
│   ├── subscriptions.ts
│   └── auth.middleware.ts
├── integrations/ (Phase 7)
│   ├── telematics.adapter.ts
│   ├── government.adapter.ts
│   ├── insurance.adapter.ts
│   ├── tax.adapter.ts
│   ├── fuel.adapter.ts
│   ├── bank.adapter.ts
│   ├── webhooks.ts
│   └── auth.tokens.ts
└── routers.ts (modified in Phase 2)

client/
├── src/
│   ├── hooks/
│   │   ├── useSubscription.ts (Phase 6)
│   │   └── useRealtimeFleetStatus.ts (Phase 6)
│   └── components/
│       ├── DriverPreTripChecklist.tsx (Phase 5)
│       ├── DriverIssueSubmission.tsx (Phase 5)
│       └── workspaces/
│           ├── FleetManagerOverviewWorkspace.tsx (modified Phase 3)
│           ├── DriverWorkspace.tsx (modified Phase 5)
│           └── OrganizationSettingsWorkspace.tsx (modified Phase 7)
```

---

## Testing Strategy (ensures nothing breaks)

For each phase:

```
1. Create new files in isolated directory
2. Write unit tests for new files (100% coverage target)
3. Contract tests: Verify existing files' outputs unchanged
4. Integration tests: New + existing = no side effects
5. E2E tests: Existing user flows still work
6. Smoke test on staging: Full app still runs
7. Gradual rollout: Feature flag enabled for 10% users first
```

Example for Phase 2:
```typescript
// test: routers still work with AND without event publishing
it('workOrderCreate returns same result whether events published or not', async () => {
  const result1 = await createWorkOrder(/* params */); // events disabled
  const result2 = await createWorkOrder(/* params */); // events enabled
  expect(result1).toEqual(result2);
});
```

---

## Conclusion

- **37 new files** total across all phases
- **15 existing files** modified minimally
- **0 breaking changes** guaranteed
- **Each phase** is independent and can be paused/rolled back
- **Progressive enhancement**: Each phase makes the system more intelligent, not more fragile

Ready to start Phase 1 (fix bugs) or Phase 2 (events)?
