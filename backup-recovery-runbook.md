# FleetOps Backup and Recovery Runbook

## Purpose and recovery objectives

This runbook defines the recovery procedure for FleetOps data held in Supabase PostgreSQL, Supabase Storage, and Supabase Auth. It is intended for the organization owner and the platform operator. The recovery objective is to restore the database and evidence references consistently, then verify that organization and role isolation still hold before returning the tenant to service.

The operational target is a **24-hour recovery point objective** for PostgreSQL and a **24-hour recovery point objective** for evidence metadata. Attachments must be retained according to the document retention policy recorded in organization settings; the database is the source of truth for attachment ownership, checksum, retention, and lifecycle state.

## Backup inventory

| Surface | Source of truth | Backup / recovery action | Verification |
|---|---|---|---|
| PostgreSQL | Supabase PostgreSQL project | Use Supabase-managed point-in-time recovery or an authorized `pg_dump` export. Never restore into production without a separate verification target. | Run schema migration verification, `SELECT 1`, tenant-count checks, and the FleetOps Vitest contract suite. |
| Storage evidence | Supabase Storage buckets and document metadata | Preserve bucket objects and the `documents` metadata rows together. Restore objects before enabling document access. | Compare object keys and SHA-256 checksums with database metadata; request an authorized signed URL and confirm raw public URLs are not returned. |
| Auth | Supabase Auth users, identities, and recovery configuration | Use the Supabase project Auth export/recovery facility. Do not copy password hashes manually. | Confirm owner and invited-user identities, invitation redemption, refresh-token recovery, and organization membership mapping. |
| Migrations | `supabase/migrations/` and Drizzle schema | Keep migration files in version control and apply them only through the linked Supabase project workflow. | Compare remote migration history with repository migrations before application startup. |

## Scheduled operational backup procedure

At least daily, the platform operator must confirm that the Supabase project backup or point-in-time recovery window is healthy. When an external export is required, create an encrypted PostgreSQL export using the approved Supabase CLI or PostgreSQL tooling, store it outside the application repository, and record the export timestamp, project reference, migration revision, and checksum in the operator log. Never commit database exports, Auth exports, storage credentials, or signed URLs.

For Storage, verify that the bucket configuration and lifecycle rules are present. A database-only restore is incomplete if the corresponding evidence objects are missing. A Storage-only restore is also incomplete if the restored object key does not match the tenant-scoped document metadata and checksum.

## Recovery procedure

1. Declare the incident and freeze destructive administration actions for the affected organization. Record the incident identifier, UTC start time, affected project, and suspected recovery point.
2. Create or select a separate recovery target. Do not overwrite the production project during the first restore attempt.
3. Restore PostgreSQL using Supabase point-in-time recovery or the approved encrypted export. Apply only migrations that are absent from the restored migration history.
4. Restore Storage objects and verify every restored object against the document metadata checksum, byte size, MIME allowlist, retention date, and tenant ownership. Mark missing objects for operator review; do not silently create replacement evidence.
5. Restore Auth through the Supabase-supported recovery path. Never send recovered credentials through chat, email, logs, or source control. Force refresh-token recovery if the incident involved credential exposure.
6. Run the FleetOps health, release, RBAC, tenant-isolation, document-access, inventory-concurrency, financial-integrity, and notification-policy tests against the recovery target.
7. Validate the organization chain: owner login, organization settings, member lookup, invitation redemption, role-bound workspace selection, and tenant-scoped query responses.
8. Validate the operational loop with a non-production fixture: vehicle issue, Fleet Manager triage, work-order assignment, mechanic execution, inventory consumption/return, review approval, and accountant reconciliation.
9. Compare counts and checksums against the incident snapshot. Obtain organization-owner approval before cutover.
10. Cut traffic to the recovered project only after smoke tests pass. Preserve the original project read-only until the incident review is complete.

## Organization deletion and retention policy

Organization deletion is a controlled, destructive operation. Before deletion, the owner must export the organization’s permitted CSV/PDF reports and confirm that required evidence retention has elapsed. The platform operator must record the organization ID, deletion approval, export checksum, and retention decision. Deletion must remove or irreversibly anonymize tenant records according to the approved policy and must not leave publicly accessible Storage objects. Pending invitations, sessions, signed URLs, and background maintenance references must be invalidated.

## Restore verification checklist

A recovery is successful only when all of the following are true: PostgreSQL responds to a health check; migration history matches the application release; organization and user counts are plausible; every returned relation is tenant-scoped; role guards deny cross-workspace access; document access returns only short-lived authorized URLs; restored attachment checksums match; inventory adjustments reject stale expected quantities; financial corrections require reasoned reversals; notifications retain dedupe and escalation metadata; and the production smoke test completes without an elevated 401/500 pattern.

## Evidence and audit trail

The incident log must contain the recovery point, project reference, release identifier, migration revision, database export checksum if used, Storage verification result, Auth verification result, test command output, owner approval, and cutover timestamp. This runbook is operational documentation; it does not authorize destructive SQL or bypass Supabase access controls.
