# Scheduled Report Delivery Design

## Decision

FleetOps will deliver scheduled reports through the application's authenticated background callback rather than an in-process timer. The callback is a POST endpoint under `/api/scheduled/`, authenticated as a platform cron identity, and every schedule is resolved by its durable task UID. No request-body organization or recipient field is trusted.

The first release will deliver reports as in-app notifications containing a secure report link and a compact summary. Email delivery remains provider-neutral until the organization selects and configures a transactional email service. This keeps report generation and authorization testable without claiming an external message was delivered.

## Authorization model

| Actor | Create or change schedules | Receive reports | View report data |
| --- | --- | --- | --- |
| Superadmin | Yes, own organization only | Yes | Organization-wide reports permitted by role |
| Fleet Manager | No | Yes for operational reports | Fleet-readiness and maintenance scope |
| Accountant | Yes for financial reports | Yes for financial reports | Financial and cost scope |
| Inventory Manager | No | Yes for inventory reports | Inventory and procurement scope |
| Mechanic, Technician, Driver | No | No by default | Only their existing operational workspace scope |

A schedule stores `orgId`, report kind, UTC cron expression, enabled state, creator, and an allow-listed recipient set. The server intersects requested recipients with organization members and the report's role policy before persisting. Cross-organization recipients, unsupported report kinds, and unauthorized role combinations are rejected.

## Delivery guarantees

The callback is idempotent. It resolves the schedule by `taskUid`, computes a deterministic period key, and records one delivery per schedule-period pair. Retries return success after observing an existing delivery record. Report payloads contain no secrets, authentication tokens, or unrelated tenant records. Failed generation is logged with a request ID and returns a JSON error so the platform can retry.

## Release sequence

The schema and tRPC procedures must be implemented and tested before a schedule is created. The callback must then be deployed and verified against production. Only after deployment should a project-level or user-owned Heartbeat job be created. The callback uses the existing Heartbeat SDK and never uses `setInterval`, `node-cron`, or a process-local timer.

## Open delivery dependency

A transactional email provider is intentionally not selected yet. Once chosen, the existing `server/invitation-email.ts` pattern can be extended with a report-specific template; the report callback must still persist an in-app delivery record before attempting external delivery and must surface provider failure without marking the delivery as sent.
