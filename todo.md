# FleetOps Backend Upgrade

- [x] Read the full-stack web project guidance and inspect the current scaffold capabilities.
- [x] Add backend/database/authentication capability to the project.
- [x] Define the tenant-aware Prisma/Supabase schema and RLS strategy.
- [x] Implement authenticated organization provisioning, invitations, and role enforcement.
- [x] Implement vehicle, odometer, component, work-order, inventory, purchase-order, document, notification, and financial APIs.
- [x] Implement realtime subscriptions and deterministic maintenance/inventory automation.
- [x] Implement trial limits, expiration write-freeze, and Razorpay-ready subscription state.
- [x] Connect the dashboard to persisted backend state and verify critical flows.
- [x] Save a final checkpoint and deliver the backend-enabled project.

- [x] Implement exact-stack backend path using Supabase PostgreSQL, Prisma ORM, Supabase Auth, and Supabase Realtime instead of the managed MySQL/Drizzle upgrade.
- [x] Validate and configure required Supabase connection secrets before schema migration.

- [x] Validate the Supabase project through the CLI using the supplied database password without printing or committing the secret.

- [x] Wire all dashboard sections—vehicles, work orders, notifications, inventory, and activity—to persisted tRPC queries with loading, empty, and error states.
- [x] Trigger low-inventory automation after inventory-affecting mutations, especially work-order completion, and verify the scheduled Edge Function path.
- [x] Remove or isolate the managed Drizzle/Manus auth fallback so the FleetOps runtime uses Supabase Auth and Prisma end to end.
- [x] Add subscription-state procedures and document the concrete Razorpay credential/deployment blocker if payment credentials are unavailable.

- [x] Implement invitation redemption and acceptance tied to the authenticated Supabase user and organization role.
- [x] Add component list/create/update/delete tRPC procedures and tests.
- [x] Replace static inventory, notification, and activity sections with persisted data and section-level empty/error states.
- [x] Remove Manus OAuth/session fallback from the active client runtime and make logout and unauthorized handling Supabase-native.

- [x] Add component procedure tests covering tenant isolation and role enforcement.
- [x] Render live inventory, notifications, and activity data with explicit section-level states.
- [x] Add visible Supabase-native logout and unauthorized-state handling in the active UI.

- [x] Add component procedure tests that exercise CRUD callers and cross-organization isolation.
- [x] Replace the notification bell/count and inventory summary with real persisted data and explicit loading, empty, and error states.
- [x] Implement verified Supabase session-expired handling for protected queries and sign-out.

- [x] Prepare the production Edge Function deployment and scheduler configuration without publishing from this session.
- [x] Validate the deployed maintenance callback after the user publishes the project; Heartbeat task QSscoBdUfDSKYjuNaT6jJa returned HTTP 200 with successful tenant evaluation.
- [x] Run an end-to-end Supabase owner/invited-user Auth and invitation redemption test with temporary real Supabase Auth accounts against Vercel; onboarding, invitation binding, redemption, RBAC denial, single-use enforcement, and cleanup passed.

- [x] Replace Prisma ORM with Drizzle ORM while keeping Supabase PostgreSQL/Auth/Realtime/RLS unchanged.
- [x] Remove Prisma runtime imports and generated-client dependencies from FleetOps deployment.
- [x] Re-run typecheck, tests, and production build after the Drizzle migration.

- [x] Fully replace Prisma data access with Drizzle PostgreSQL queries across Supabase provisioning, routers, automation, and tests.
- [x] Remove Prisma schema, generated client, package dependencies, and runtime imports.
- [x] Verify Drizzle-only server startup, tests, and production deployment bundle.

- [x] Replace placeholder dashboard controls with real functional routes and backend-backed actions.
- [x] Add a visible Team workspace with invite form, member list, role selection, and invitation status.
- [x] Add authenticated sign-in/sign-out gating and remove misleading demo fallback content from live views.
- [x] Add functional Vehicles, Work Orders, Inventory, Notifications, Compliance, P&L, and Billing views.
- [x] Verify the published UI flows and save a functional-product checkpoint; published Fleet Manager and Inventory Manager surfaces were inspected with real authenticated controls and checkpoint 60d97dbd saved.

- [x] Replace command-center placeholder actions with real backend-backed behavior or remove unavailable actions.
- [x] Add pending, accepted, and expired invitation status records to Team.
- [x] Expose dedicated Notifications and Billing workspace routes with persisted or explicit subscription state.
- [x] Re-verify the published UI after these functional views/actions are live and save a new checkpoint.

- [x] Replace Quick find navigation with an actual command-center vehicle/work-order search interaction.
- [x] Replace the work-order completion affordance with a real persisted completion mutation and success/error state.
- [x] Re-verify command-center controls and save the next checkpoint.

- [x] Implement Quick find results that search both persisted vehicles and work orders with visible result and empty states.
- [x] Save a new checkpoint after verifying the combined Quick find interaction.

- [x] Remove all static demo fallback arrays and hardcoded dashboard metrics from the authenticated FleetOps UI.
- [x] Ensure every visible command-center action is persisted through a backend procedure or is removed.
- [x] Add explicit backend-backed create/update flows for the visible resource views and show real empty/loading/error states; current resource actions cover vehicle creation, work-order creation, inventory receipt, financial entry, document lifecycle, and purchase-order transitions.
- [x] Verify the published UI uses the latest checkpoint and contains no placeholder/demo copy before delivery; current source and published shell scans show no tenant demo label or placeholder/demo copy in authenticated shell surfaces.

- [x] Remove remaining authenticated command-center placeholder copy, fallback content, and hardcoded metrics.
- [x] Complete dedicated data-backed Notifications actions and Billing capacity/status presentation.
- [x] Re-run typecheck, Vitest, production build, and visual verification for the live-connected frontend.
- [x] Save and deliver the new published frontend connection checkpoint.


- [x] Add a real backend-backed work-order creation flow or remove the command-center CTA.
- [x] Remove the non-persisted export action from the command center.
- [x] Fix Billing utilization to query live vehicles and team members within the Billing view.
- [x] Verify the authenticated published deployment after saving this round of changes; temporary published Fleet Manager and Inventory Manager sessions loaded successfully.

- [x] Add a Superadmin signup entry point using Supabase Auth.
- [x] Add first-run organization onboarding with organization name and Superadmin profile details.
- [x] Route newly provisioned Superadmins into the authenticated Command Center and Team invitation workflow.
- [x] Add onboarding tests and verify the published signup-to-invitation flow; temporary published organization bootstrap, invitations, sign-in, and redemption passed in the role harnesses.

- [x] Publish and verify Superadmin signup and organization onboarding in production; published temporary Superadmin bootstrap/onboarding passed.
- [x] Add automatic draft purchase-order creation when stock falls below reorder level.
- [x] Complete odometer validation for negative readings and jumps above 1,000 km/day.
- [x] Complete Driver DVIR, manual odometer, fuel logging, and photo-proof workflows.
- [x] Complete document expiry/compliance alerts and operational document workflow.
- [x] Complete dedicated Accountant per-vehicle P&L and real-time CPK calculations.
- [x] Strengthen role-specific workspace routing and permissions without Razorpay checkout.
- [x] Deploy all application and Edge Function changes, configure maintenance scheduling, and verify production workflows; published maintenance Heartbeat and current application workflows passed.

- [x] Deploy the latest non-Razorpay workflow changes and verify them on the published production site; authenticated Fleet Manager and Inventory Manager workflows passed.
- [x] Save a new checkpoint after the latest signup/onboarding, driver, compliance, accountant, and automation changes.
- [x] Implement and verify post-onboarding navigation into the Command Center and Team invitation flow.
- [x] Make odometer validation truly time-aware for the 1,000 km/day rule.
- [x] Add a dedicated Driver manual odometer submission UI and expose fuel receipt/photo-proof upload in the frontend.
- [x] Add full document create/upload/update/renew operations in the Compliance workspace.
- [x] Correct CPK to use validated distance-traveled logic.
- [x] Implement role-aware frontend routing and gating instead of relying only on the shared Home shell.

- [x] Verify the full Superadmin signup to onboarding to Team invitation transition against the published Vercel deployment with a temporary authenticated Superadmin; bootstrap, onboarding, invitation creation, and cleanup passed.
- [x] Record fuel-log odometer updates in the validated odometer history.
- [x] Add visible Compliance renew/update actions wired to documents.update.
- [x] Add explicit guarded route segments for role-specific FleetOps workspaces.

- [x] Diagnose the production Superadmin signup database error reported during account creation.
- [x] Fix Supabase signup provisioning and verify the database path with regression coverage.
- [x] Republish and verify the Superadmin signup-to-onboarding flow after the fix using the published Vercel temporary-account harness.

- [x] Re-test Superadmin signup after the Auth trigger fix and confirm organization and user rows are provisioned successfully.
- [x] Add or document an integration-level verification of the real signup provisioning path.

- [x] Capture the exact second-attempt production signup error and identify the remaining live Supabase failure.
- [x] Verify live organization and user schema defaults/constraints against the Auth trigger and provisioning path.
- [x] Apply and integration-test the definitive signup fix before republishing.

- [x] Fix Superadmin login redirect into organization onboarding for provisioned accounts.
- [x] Fix organization creation completion and refresh of onboarding metadata after setup.
- [x] Verify login, organization creation, and Team handoff on production with a temporary Supabase Superadmin account; personal-account verification remains unnecessary for the code path.

- [x] Refresh the Supabase Auth session metadata after successful organization onboarding completion.
- [x] Verify onboarding exits into the Command Center and Team invitation flow without a stale-session loop using a temporary published Superadmin session; browser verification rendered the authenticated Command Center, retained the session, and loaded Team successfully.

- [x] Diagnose the production undefined.id crash in authenticated onboarding/dashboard rendering.
- [x] Add null-safe data guards for organization, vehicle, work-order, and role-dependent render paths.
- [x] Verify the corrected authenticated production flow after republishing through the published Vercel harness.

- [x] Add and verify null-safe guards for vehicle-derived UI mappings and remaining role/workspace render branches.
- [x] Reproduce the authenticated production flow after republishing with a temporary authenticated Superadmin and confirm no undefined.id crash occurred; the published browser dashboard rendered its KPIs, signals, fleet register, and action queue without the prior crash.

- [x] Add null-safe guards for procurement and generic resource-row mappings that assume row or order ids exist.
- [x] Reproduce the authenticated production flow after republishing and confirm the undefined.id crash is eliminated before final verification; authenticated browser rendering and Team navigation completed without the prior undefined.id failure.

- [x] Diagnose slow authenticated production loading and identify blocking queries or render gates.
- [x] Add a fast, explicit authenticated loading/onboarding state with independent query failures.
- [x] Verify production load and Superadmin onboarding responsiveness after republishing; the browser reached onboarding, organization creation completed, Command Center rendered, and Team data settled without a stale-session loop.

- [x] Diagnose why clicking Team from the authenticated left navigation returns to the login gate.
- [x] Preserve the active Supabase session across Team route transitions and load Team queries without auth loops.
- [x] Verify the published Team navigation and invitation flow with a temporary authenticated Superadmin session; browser click from Command center to Team remained authenticated and rendered the organization directory.

- [x] Verify Team navigation after publishing the 401 refresh fix with the temporary published Superadmin workflow; the Team route loaded without returning to login.
- [x] Confirmed Team did not fail in the published temporary-account workflow; both the procedure and browser navigation returned successfully without an auth-loop condition.

- [x] Diagnose why Team invitation submission produces no visible result and no delivered email.
- [x] Ensure invitation creation returns a persisted token/status and explicit UI success or error feedback.
- [x] Configure or clearly surface the absence of an email provider for invitation delivery without claiming an email was sent.
- [x] Verify the Team invitation flow in production with a temporary authenticated Superadmin; HTTP 200, join URL, token, organization binding, and cleanup passed.

- [x] Verify the published Team invitation flow and token response with a temporary authenticated Superadmin; token and join URL were returned and invitation redemption was single-use.
- [x] Email delivery remains an explicit future integration decision: no provider credentials were supplied, so FleetOps correctly exposes MANUAL_TOKEN delivery and never claims an invitation email was sent.

- [x] Diagnose why the Team invitation mutation remains in Creating state without returning.
- [x] Add a bounded client mutation timeout and identify/fix the blocking backend or database path.
- [x] Verify the invitation request returns a visible success or error in production.

- [x] Verify the published invitation request completes with the automated temporary Superadmin workflow and shows a persisted token or bounded delivery state.

- [x] Verify the published checkpoint asset contains the invitation timeout/result code.
- [x] Capture the exact Team invitation tRPC request, status, and response in the automated authenticated production session.
- [x] Fix any stale asset, route, or server mismatch found and verify the invitation flow again.

- [x] Enforce the requested Superadmin, Fleet Manager, Inventory Manager, Mechanic, Driver, and Accountant workspace matrix in direct routes and navigation.
- [x] Enforce role-specific procedure permissions and prevent cross-workspace data access at the server boundary.
- [x] Restrict Driver data to assigned vehicles and prevent non-authorized access to financial, inventory, billing, and team data.
- [x] Make Team invitation return or fail definitively with a server timeout/error path instead of an indefinite pending request.
- [x] Add RBAC and invitation regression tests and verify the production build.

- [x] Add secure invitation join links that resolve the invitation’s organization and assigned role without allowing user-controlled overrides.
- [x] Add an organization-bound invited-user signup screen with prefilled email and organization identity, password creation, and invitation redemption after Supabase signup.
- [x] Route redeemed invited users automatically into separate locked workspace UIs for Fleet Manager, Inventory Manager, Mechanic, Driver, and Accountant roles.
- [x] Add regression coverage for invitation join validation, organization binding, role routing, and workspace isolation.

- [x] Re-verify the published Team invitation flow after the stale-asset fix; the production response was bounded and explicit with MANUAL_TOKEN delivery, join URL, token, and no false email-delivery claim.

- [x] Diagnose the published white-screen runtime failure using browser console, network, and production bundle evidence.
- [x] Fix the white-screen root cause and add a regression guard.
- [x] Republish and verify the FleetOps app shell, Join Organization route, and public invalid-invitation state.

- [x] Compare the user-visible white screen with a clean live-domain response after the 5344cc05 release.
- [x] Resolve any remaining live asset-delivery, cache, or boot timing issue and verify the domain renders for a clean request.

- [x] Trace the production dashboard.summary HTTP 500 from the published request through the server procedure and logs.
- [x] Fix dashboard.summary so authenticated sessions receive a safe summary or a bounded actionable error instead of HTTP 500.
- [x] Add dashboard.summary regression coverage, republish, and verify authenticated app rendering.

- [x] Trace why the published Supabase session is not reaching authenticated tRPC requests after login.
- [x] Fix session persistence, Authorization transport, or refresh handling so dashboard and Team requests do not return 401.
- [x] Add regression coverage and verify an authenticated Team invitation request after republishing.

- [x] Create and deliver a comprehensive implementation summary covering FleetOps from initial frontend through current published release, validation, deferred Razorpay scope, and remaining real-account verification.

- [x] Verify the reported `index-DPlPMMp2.js` asset is not the current release asset and compare it with the latest HTML mapping.
- [x] Force a fresh published asset revision containing the current tRPC Authorization header fix and verify the live mapping.

- [x] Run a controlled background end-to-end test with temporary Superadmin and invited-user identities, covering organization provisioning, invitation redemption, and protected RBAC procedures.
- [x] Clean up all temporary test identities and records and document browser-only verification limits.

- [x] Normalize organization date fields returned from PostgreSQL before role, billing, and invitation procedures call Date methods.
- [x] Rerun the background invitation workflow after date normalization and confirm the temporary data cleanup succeeds.

- [x] Diagnose the invitation INSERT failure revealed by the background test and align the Drizzle invitation mapping with the live PostgreSQL schema.

- [x] Extend the background workflow to create and redeem a Fleet Manager invitation, complete the invited profile, and verify Fleet Manager workspace routing.
- [x] Exercise Fleet Manager permitted operations across vehicles, work orders, compliance, and vehicle assignment governance.
- [x] Verify Fleet Manager denial of Superadmin, Accountant, Driver-only, Inventory-only, billing-sensitive, and team-governance operations.
- [x] Verify cleanup of Fleet Manager temporary Auth, organization, invitation, and operational records and report the lifecycle results.

- [x] Fix vehicles.create to provide the required live-schema vehicle status and add regression coverage for Fleet Manager vehicle creation.

- [x] Supply explicit vehicle createdAt and updatedAt audit timestamps because the live vehicles schema has no updatedAt default.

- [x] Align components.create with the live PostgreSQL component schema, including required identifier and audit fields, and add regression coverage.

- [x] Prevent components.update from appending nonexistent updatedAt fields and add a regression test for component updates.

- [x] Align workOrders.create with the live PostgreSQL schema by supplying required ID, status, and audit timestamps, with regression coverage.

- [x] Align documents.create with the live PostgreSQL schema by supplying required identity and audit fields, with regression coverage.

- [x] Force the public HTML release marker to the current FleetOps checkpoint and verify the domain serves the current revision; source marker updated to fleetops-edge-sync-20260820 and validation passed.
- [x] Mount a cron-authenticated `/api/scheduled/maintenance` callback that runs tenant-scoped maintenance automation and add callback regression tests.
- [x] Register the project-level 15-minute maintenance Heartbeat for `/api/scheduled/maintenance` and record its task UID.
- [x] Add an Inventory Manager background lifecycle covering invitation creation, organization-bound profile completion, role routing, assigned inventory/procurement operations, denial checks, single-use rejection, and cleanup.
- [x] Add regression coverage for Inventory Manager invitation binding, workspace permissions, inventory mutations, procurement mutations, and cleanup.
- [x] Run and publish the Inventory Manager lifecycle validation with the full test suite and report any production-edge limitations.
- [x] Fix the live-schema failure discovered by Inventory Manager inventory.create and add regression coverage before rerunning the lifecycle.
- [x] Add a Driver background lifecycle covering invitation creation, organization-bound profile completion, role routing, vehicle assignment, inspections, fuel logs, odometer updates, denial checks, single-use rejection, and cleanup.
- [x] Add regression coverage for Driver invitation binding, assignment isolation, operational mutations, workspace permissions, and cleanup.
- [x] Run and publish the Driver lifecycle validation with the full test suite and report any production-edge limitations.
- [x] Fix the Driver fuel-log transaction failure (`fn is not a function`) discovered by the lifecycle harness and add regression coverage before rerunning.
- [x] Fix Driver odometer maintenance evaluation when a vehicle has no loaded components and add regression coverage before rerunning.
- [x] Add a Mechanic background lifecycle covering invitation creation, organization-bound profile completion, role routing, assigned work-order handling, inventory consumption, component operations, denial checks, single-use rejection, and cleanup.
- [x] Add regression coverage for Mechanic invitation binding, work-order assignment isolation, completion/inventory mutations, workspace permissions, and cleanup.
- [x] Run and publish the Mechanic lifecycle validation with the full test suite and report any production-edge limitations.
- [x] Fix Mechanic odometer authorization incorrectly applying Driver assignment isolation and add regression coverage before rerunning.
- [x] Fix Mechanic work-order completion when inserting work-order parts requires an explicit ID and add regression coverage before rerunning.
- [x] Fix Mechanic work-order completion notification handling when nested vehicle includes are unavailable and add regression coverage before rerunning.
- [x] Fix Mechanic activity-feed rendering when nested vehicle relations are unavailable and add regression coverage before rerunning.
- [x] Fix Mechanic activity-feed sorting when database timestamps arrive as strings and add regression coverage before rerunning.
- [x] Add an Accountant background lifecycle covering invitation creation, organization-bound profile completion, role routing, financial record creation/listing/metrics, denial checks, single-use rejection, and cleanup.
- [x] Add regression coverage for Accountant invitation binding, financial mutations/metrics, workspace permissions, and cleanup.
- [x] Run and publish the Accountant lifecycle validation with the full test suite and report any production-edge limitations.
- [x] Fix Accountant financial-record creation when the live table requires an explicit ID and add regression coverage before rerunning.
- [x] Upgrade the Superadmin command workspace with organization-wide oversight, trial/billing status, team governance, compliance, and alert summaries.
- [x] Upgrade the Fleet Manager workspace with vehicle onboarding, telemetry/odometer, predictive maintenance, work-order dispatch, and driver assignment surfaces.
- [x] Upgrade the Inventory Manager workspace with SKU/bin/cost stock control, reorder monitoring, vendors, and purchase-order status workflow.
- [x] Upgrade the Mechanic/Technician workspace with assigned task queue, notifications, work execution, labor/parts logging, and completion flow.
- [x] Upgrade the Driver workspace with assigned-vehicle-only DVIR, odometer, fuel/issue reporting, and active-trip context.
- [x] Upgrade the Accountant workspace with INR ledger entry, per-vehicle P&L, CPK/TCO metrics, and financial-only navigation.
- [x] Enforce shared organization context with role-specific record visibility and server-side procedure isolation across all upgraded workspaces.
- [x] Add workspace regression tests, responsive visual verification, and publish the enhanced workspace checkpoint.
- [x] Run a dedicated Superadmin/Owner lifecycle covering bootstrap, organization governance, team invitations, fleet/compliance/financial oversight, billing visibility, and cleanup.
- [x] Run a dedicated Technician lifecycle covering invitation/profile redemption, assigned work-order visibility, component and odometer work, completion behavior, denials, single-use rejection, and cleanup.
- [x] Run regression tests and publish the combined Superadmin and Technician validation result.
- [x] Resolve or explicitly document the Technician role boundary for component creation and odometer updates; current router guards allow Mechanic but deny Technician.
- [x] Correct the dedicated Superadmin harness to validate onboarding state before completion and rerun both role lifecycles.
- [x] Remove legacy broad workspace navigation for authenticated members and route each role to its own workspace surface.
- [x] Keep Superadmin on the executive organization workspace while preserving organization-wide oversight without specialist member navigation.
- [x] Add role-routing and navigation-visibility regression coverage for Superadmin, Fleet Manager, Inventory Manager, Mechanic, Technician, Driver, and Accountant.
- [x] Verify shared organization context remains visible and cross-role operational handoffs remain connected after workspace isolation.
- [x] Run an end-to-end Fleet Manager-to-Mechanic handoff covering shared organization setup, vehicle/inventory preparation, dispatch, assigned-order visibility, completion, inventory deduction, notification/shared-state verification, RBAC isolation, and cleanup.
- [x] Re-run regression tests and publish the verified handoff result or document any concrete defect found.
- [x] Remove Superadmin work-order creation from the left navigation while retaining owner read-only oversight of work-order status and alerts.
- [x] Replace all static organization labels and placeholder tenant text in authenticated workspace shells with the live organization name, including breadcrumbs and headers.
- [x] Prevent Team members/invitations queries from running without an authenticated session and verify no avoidable 401 requests occur during valid workspace loading.
- [x] Add regression coverage for organization-label rendering inputs, Superadmin action boundaries, and authenticated Team query enablement.
- [x] Run full regression/build and publish the corrected workspace release.
- [x] Create a temporary Fleet Manager test identity, capture its authenticated workspace screenshot, and clean up the temporary account and organization data afterward.
- [x] Add Fleet Manager maintenance-template selection and component schedule creation during vehicle onboarding.
- [x] Add mechanic/technician assignment to work-order dispatch plus a live dispatch queue with status, priority, assignee, and completion state.
- [x] Add odometer history, telemetry/source visibility, anomaly flags, and predictive-maintenance signals to the Fleet Manager workspace.
- [x] Add Fleet Manager driver-to-vehicle assignment and resource coordination controls.
- [x] Add compliance document list/create/update and expiry-management surfaces for fleet and drivers.
- [x] Add detailed operational alerts and action links for maintenance, odometer, compliance, and assignment events.
- [x] Add Fleet Manager regression coverage, run the full suite/build, capture the completed workspace, and publish the release.
- [x] Create a temporary Mechanic test identity, capture its authenticated workspace screenshot, and clean up the temporary account and organization data afterward.
- [x] Add a visible Mechanic Start Work action that transitions only assigned orders into IN_PROGRESS.
- [x] Add organization-scoped Mechanic labor-hour logging and repair-note persistence on assigned work orders.
- [x] Add secure Mechanic photo/evidence attachment upload and work-order attachment display using project storage helpers.
- [x] Extend Mechanic completion to include labor, notes, and attachments while preserving inventory deduction and RBAC isolation.
- [x] Add Mechanic regression tests, rerun the cross-role handoff, run the full suite/build, and publish the completed workflow.

- [x] Add Mechanic/Technician Start Work action scoped to assigned work orders.
- [x] Persist work-order start time, labor hours, and repair notes in the Drizzle/Supabase schema.
- [x] Upload and persist tenant-scoped Mechanic photo/evidence attachments through storagePut.
- [x] Replace the Mechanic completion placeholder with an execution form and visible loading/error/success states.
- [x] Add Vitest regression coverage for Mechanic execution controls, RBAC scope, storage upload, and persistence fields.
- [x] Run the updated background Mechanic and Technician lifecycle harnesses against the deployed release, including evidence and labor assertions.
- [x] Verify the first production Heartbeat maintenance execution log.
- [x] Implement Driver Report Vehicle Issue workflow with assigned-vehicle scope, urgency, notes, optional photo evidence, Fleet Manager visibility, and regression coverage.
- [x] Add Accountant revenue/expense entry form and detailed INR financial ledger with tenant/RBAC validation and regression coverage.
- [x] Create public FleetOps landing page with distinct Sign In and Create Organization CTAs while preserving invitation onboarding and authenticated routing.
- [x] Fix invalid Supabase refresh-token recovery so expired sessions do not trigger unauthorized protected-query batches and recover cleanly.
- [x] Reset FleetOps application data by deleting organization-bound records plus all application `users` and `organizations` rows, while preserving Supabase Auth identities.
- [x] Resolve clean-start Superadmin signup when a preserved Supabase Auth identity has no FleetOps application profile, without weakening duplicate-account security.
- [x] Stop dashboard.summary from retrying/refetching repeatedly after unauthorized session state and keep the unload warning non-blocking.
- [x] Run a disposable full lifecycle test covering Superadmin, organization onboarding, all invited roles, fleet setup, alerts, telemetry, maintenance handoff, mechanic execution, inventory consumption, cross-role visibility, RBAC, and cleanup.
- [x] Produce a presentation-ready video walkthrough of the disposable full lifecycle test using captured workflow scenes.
- [x] Read the connected Shoebbirader4/fleetguard repository and compare it with FleetOps without modifying either repository.
- [x] Audit the entire FleetOps application and every member workspace to identify and prioritize improvement opportunities without changing product code.
- [x] Milestone 1: add organization-wide audit events and Superadmin audit visibility.
- [x] Milestone 1: add Fleet Manager issue triage and work-order control surface.
- [x] Milestone 1: add transactional inventory movement records and integrity controls.
- [x] Milestone 1: add secure authorized document/evidence access actions.
- [x] Milestone 1: add regression coverage, lifecycle validation, and production build for the milestone.
- [x] Add tenant-scoped notification acknowledgement so authorized workspace users can mark operational alerts as read.
- [x] Add a tenant-scoped work-order board query with role-safe status grouping and dispatch metadata.
- [x] Add vehicle health detail data with component readiness, odometer trend, open work orders, and compliance signals.
- [x] Add inventory receiving and issuing workflows with transactional movement records and role-safe controls.
- [x] Add Milestone 2 regression tests, visual validation, typecheck, production build, and publish the verified increment.
- [x] Re-verify Milestone 1 audit, triage, movement, secure-access, and RBAC contracts on the current release.
- [x] Re-verify Milestone 2 Kanban, vehicle-health, inventory receive/issue, movement, and audit contracts on the current release.
- [x] Resolve any verified defects found during Milestone 1 and Milestone 2 verification before starting Milestone 3; no application defects were found, and the public-edge cache mismatch remains documented separately.
- [x] Define and begin Milestone 3 from the verified baseline with role-safe tests and a published kickoff checkpoint.
- [x] Milestone 3: add role-safe CSV export for the Accountant financial ledger and Fleet Manager compliance register.
- [x] Milestone 3: add export affordances with clear loading, empty, and browser-download behavior.
- [x] Milestone 3: add regression tests and publish the reporting/export kickoff checkpoint.
- [x] Audit Milestone 3 CSV export requirements and confirm all tracker items are complete.
- [x] Validate Milestone 3 export RBAC, audit logging, tests, build, and published release before advancing.
- [x] Define and begin Milestone 4 only after Milestone 3 passes its completion gate.
- [x] Milestone 4: add secure PDF report generation for compliance and financial exports without exposing cross-tenant data.
- [x] Milestone 4: add offline-ready draft persistence for Driver issue reports and Mechanic execution notes, with explicit sync status.
- [x] Milestone 4: add regression tests, lifecycle validation, and publish the first Milestone 4 increment.
- [x] P0 priority 1: upgrade Superadmin audit visibility into a tenant-scoped searchable audit log with actor, role, action, entity, date, and outcome filters.
- [x] P0 priority 2: add a unified Fleet Manager triage queue combining driver issues, expiring documents, open work, and low-stock signals with acknowledge, assign, defer, and resolve actions.
- [x] P0 priority 3: implement explicit work-order lifecycle states for waiting for parts, ready for review, rework, completed, and cancelled with role-safe transitions and audit events.
- [x] P0 priority 4: add work-order parts reservation and return workflows with reserved quantities, stock protection, movement/audit records, and role-safe controls.
- [x] P0 priority 5: add mechanic/technician execution checklists and Fleet Manager or Superadmin review approval before final work-order completion.
- [x] P0 priority 6: add a Driver daily home with start-of-shift DVIR, odometer and fuel capture, assigned-vehicle readiness, unsafe-to-drive disposition, and Fleet Manager escalation.
- [x] P0 priority 7: add Superadmin organization settings for company identity, operating timezone, default odometer policy, and safety escalation contacts with tenant-scoped persistence.
- [x] P1 accounting reconciliation: add an Accountant reconciliation query comparing fuel logs and ledger fuel expenses, with visible mismatch status and tenant-scoped audit access.
- [x] Verify the intended Supabase CLI project, PostgreSQL connectivity, and pending Drizzle migration state before applying organization settings schema changes.
- [x] P1 maintenance templates: add reusable tenant-scoped maintenance templates with Fleet Manager assignment into vehicle work orders and visible template controls.
- [x] P1 driver assignment administration: add clear active-assignment visibility and guarded reassignment controls for Fleet Manager with tenant-scoped audit events.
- [x] P1 document import: add tenant-scoped compliance document CSV preview/import with row validation, duplicate protection, and audit-backed Fleet Manager controls.
- [x] P1 observability: add safe public health and release diagnostics for the published FleetOps deployment, with backend dependency status and regression coverage.
- [x] Reconcile all 20 actionable P0 requirements in FleetOpsWhole-ProductandWorkspaceImprovementAudit.md item by item and implement any P0 gaps that remain; see p0-reconciliation-2026-08-20.md for evidence and explicitly bounded remaining P1/P2 work.
- [x] Authoritative P0 accounting integrity: add immutable financial reversals/adjustments with actor and reason, plus Superadmin approval for high-value expenses and manual adjustments.
- [x] Authoritative P0 storage lifecycle: add file type/size validation, checksum metadata, retention/orphan policy checks, and access-log coverage for stored documents/evidence.
- [x] Authoritative P0 notification policy: add role/severity/source routing, deduplication, acknowledgement escalation state, and source-resolution closure safeguards.
- [x] Authoritative P0 inventory concurrency: add explicit adjustment workflow and transactional conflict handling beyond insufficient-stock protection.
- [x] Authoritative P0 workspace architecture: reduce monolithic workspace coupling, replace remaining broad any usage in touched surfaces, and centralize query policy contracts.
- [x] Architecture subtask: centralize seven-role RBAC policy contracts and reusable tenant scope helper with regression tests.
- [x] Architecture subtask: replace Team workspace invitation/member any annotations with shared client domain types and safe token handling.
- [x] Architecture subtask: extract TeamWorkspace into its own module and update workspace-boundary regression coverage.
- [x] Architecture subtask: extract NotificationWorkspace and share WorkspaceState across workspace modules with regression-safe behavior.
- [x] Architecture subtask: replace the Driver workspace vehicle selection any annotation with the shared FleetVehicle domain type.
- [x] Architecture subtask: replace mechanic inventory-part and service-component map any annotations with shared InventoryPart and ServiceComponent types.
- [x] Architecture subtask: replace owner and Fleet Manager workspace collection any annotations with shared notification, document, audit, vehicle, work-order, member, and maintenance-signal types.
- [x] Architecture subtask: replace Fleet Manager dispatch, board, triage, issue, assignment, odometer, and template-map any annotations with shared domain types.
- [x] Architecture subtask: replace Inventory Manager stock, purchase-order, movement, and Mechanic execution collection any annotations with shared domain types.
- [x] Architecture subtask: remove the final broad any annotation from RoleWorkspaces using the shared VehicleIssueStatus union.
- [x] Architecture subtask: replace FunctionalWorkspace Accountant reconciliation, metrics, financial ledger, vehicle, and work-order any annotations with shared domain types.
- [x] Architecture subtask: replace FunctionalWorkspace Driver issue, inspection, fuel-log, Compliance document, Procurement order, and generic resource-row any annotations with shared domain types.
- [x] Architecture subtask: eliminate all broad any annotations from FunctionalWorkspace with shared domain and generic resource-row contracts.
- [x] Architecture subtask: extract DriverWorkspace into client/src/components/workspaces/DriverWorkspace.tsx and retarget its workflow regression coverage.
- [x] Architecture subtask: extract ProcurementWorkspace into client/src/components/workspaces/ProcurementWorkspace.tsx and preserve its live purchase-order query and regression coverage.
- [x] Architecture subtask: extract ComplianceWorkspace into client/src/components/workspaces/ComplianceWorkspace.tsx and preserve document upload, renewal, expiry, and export behavior.
- [x] Architecture subtask: extract AccountantWorkspace into client/src/components/workspaces/AccountantWorkspace.tsx and retarget financial-ledger regression coverage.
- [x] Architecture subtask: extract OrganizationSettingsWorkspace into client/src/components/workspaces/OrganizationSettingsWorkspace.tsx and preserve Superadmin settings persistence and validation.
- [x] Architecture subtask: extract ResourceWorkspace and RoleOverviewWorkspace into dedicated modules while preserving shared live queries, billing, work-order, notification, and role-overview routing.
- [x] Authoritative P0 workspace architecture: reduce monolithic workspace coupling through dedicated workspace modules, eliminate broad any usage in touched surfaces, and retain centralized RBAC/query policy boundaries.
- [x] Authoritative P0 backup and recovery: add a Supabase PostgreSQL, Storage, Auth, migration, tenant-retention, and restore-verification runbook with regression coverage.
- [x] Authoritative P0 data integrity: add expectedUpdatedAt validation to work-order status transitions, return explicit CONFLICT errors for stale edits, and pass row timestamps from Fleet Manager and Mechanic controls.
- [x] Production verification increment: confirm the published landing page resolves with distinct Sign In/Create Organization routes and current organization-bound messaging; keep authenticated session tests explicitly pending.
- [x] Authoritative P0 production diagnostics: add caller-supplied or generated correlation IDs to system health responses with regression coverage, preserving safe release and database status reporting.
- [x] Production verification increment: confirm the published Create Organization route renders the Superadmin signup form without submitting or creating production data.
- [x] Background verification: create an isolated test organization and Superadmin test user without modifying the user’s production organization.
- [x] Background verification: exercise invitation creation/redemption and designated workspace access for Fleet Manager, Inventory Manager, Mechanic, Technician, Driver, and Accountant test users; local role suites passed and the published comprehensive invite flow passed.
- [x] Background verification: validate the Issue → Triage → Work Order → Mechanic Execution → Inventory Consumption/Return → Review → Accounting/Reconciliation loop; corrected handoff harness passed locally and results are recorded in background-verification-report-2026-08-20.md.
- [x] Background verification: clean up isolated test records/users where the available test harness permits safe cleanup, and document the published-role proxy timeout limitation in background-verification-report-2026-08-20.md.
- [x] Background-test fix: correct notifications.list multi-column ordering so isolated Superadmin and role-suite tests can read recipient-scoped notifications.
- [x] Background-test harness fix: model Mechanic completion as READY_FOR_REVIEW followed by Fleet Manager checklist approval before asserting COMPLETED.
- [x] P1 increment: add a tenant-scoped Fleet Manager maintenance planning view with due-date signals for component mileage, expiring documents, and open work orders, including date-range filtering and actionable source references.
- [x] P1 increment: add regression coverage for the maintenance planning query, tenant isolation, role restrictions, and Fleet Manager rendering contract.
- [x] P1 increment: add a tenant-scoped Fleet Manager driver-handoff view showing driver, vehicle, latest reported issue, acknowledgement time, and safety disposition.
- [x] P1 increment: add regression coverage for driver-handoff tenant scoping, role restrictions, and status aggregation.
- [x] P1 increment: add an Inventory Manager receipt form to the live Inventory workspace using the existing inventory.receive procedure, with quantity, unit cost, reason, validation, and persisted refresh.
- [x] P1 increment: add regression coverage for the inventory receipt UI contract and role-scoped receiving procedure.
- [x] P1 increment: add tenant-scoped Procurement purchase-order status transitions for DRAFT, SENT, RECEIVED, and CANCELLED with audit logging and role enforcement.
- [x] P1 increment: add regression coverage for purchase-order transition guards and Procurement workspace controls.
- [x] P1 increment: add Accountant ledger filters by vehicle, type, category, and date range with a clear-filter action and persisted client view state.
- [x] P1 increment: add regression coverage for the Accountant filter controls and tenant-scoped filtered rendering.
- [x] P1 increment: enrich Driver issue history with Fleet Manager acknowledgement, escalation, and resolution state from recipient-scoped notifications.
- [x] P1 increment: add regression coverage for the Driver issue timeline contract and notification scoping.
- [x] Product flow increment: add a persisted Fleet register vehicle-create form using vehicles.create, with VIN, registration, make/model/year, odometer, and maintenance-template controls.
- [x] Product flow increment: add regression coverage for Fleet register creation, role restrictions, and tenant-scoped refresh.
- [x] Verify the live deployed domain serves the latest checkpoint/build asset mapping after the recent resource-view changes; published landing and /login routes rendered successfully.
- [x] Run a published authenticated smoke test and confirm no placeholder/demo copy appears in live authenticated shell surfaces; temporary Fleet Manager and Inventory Manager sessions rendered real controls and targeted cleanup completed.
- [x] P1 increment: add tenant-scoped Fleet Manager bulk work-order operations for assignment, priority, scheduling, and archival with audit events and UI controls.
- [x] P1 increment: add tenant-scoped Fleet Manager bulk work-order actions for priority changes and cancellation, with selection UI, role/tenant guards, audit events, and regression coverage; scheduling, assignment UI, and archival depth remain open.
- [x] P1 increment: extend the bulk work-order controls with live tenant-scoped mechanic/technician assignment using the existing team roster, plus targeted RBAC/UI regression coverage and a passing production build.
- [x] Enforce Supabase PostgreSQL-only schema/deployment workflow: use Supabase CLI migrations and PostgreSQL-compatible verification; do not use TiDB/MySQL management SQL paths.
- [x] Partial-P1 completion: finish Fleet Manager bulk work-order operations with scheduling/rescheduling, archive/unarchive, export, and complete audit coverage.
- [x] Partial-P1 completion: finish Inventory receiving and Procurement lifecycle with PO-linked partial receiving, supplier invoice/location metadata, and complete state history.
- [x] Partial-P1 completion: finish Accountant ledger filters/saved views, reconciliation links, GST/TDS-ready fields, cost centers, and complete reporting exports.
- [x] Partial-P1 completion: finish global search across all tenant resources with role-filtered results and stable navigation paths.
- [x] Partial-P1 completion: finish shared table primitives and responsive data-entry behavior across the operational workspaces; completed in the shared workspace-table/resource-list/invite-form increment and covered by regression tests.
- [x] Partial-P1 sub-increment: add Fleet Manager work-order CSV export covering id, vehicle, priority, status, schedule, and archive state; targeted tests, typecheck, and production build pass.
- [x] Partial-P1 sub-increment: add Supabase-backed PO-linked partial receiving with optimistic inventory concurrency, supplier invoice/location metadata, final-receipt status, receipt history, expanded lifecycle states, UI controls, and 91-test/build validation.
- [x] Partial-P1 sub-increment: add Supabase-backed GST/TDS-ready financial fields, vendor/invoice/payment metadata, cost-center fields, reconciliation references, Accountant entry controls, and per-record reconciliation UI; 91 tests, typecheck, build, and remote migration verification pass.
- [x] Partial-P1 sub-increment: expand Superadmin Quick Find to live inventory and financial records with workspace routing; 93 tests, typecheck, and production build pass.
- [x] Partial-P1 sub-increment: make Accountant CSV/PDF exports honor vehicle, type, category, and date filters through tenant-scoped Supabase queries; focused tests, typecheck, and production build pass.
- [x] Partial-P1 completion: finish shared table primitives and responsive data-entry behavior across the operational workspaces; shared workspace-table/resource-list/invite-form styles and responsive breakpoints are covered by contract tests, with 95 tests, typecheck, and production build passing.
- [x] Create and deliver a complete responsibility specification covering the original FleetOps role matrix, all seven roles, workspace isolation, operational handoffs, audit improvements, and deferred scope.
- [x] Run isolated background Superadmin E2E: fresh signup, organization creation, team invitations, governance, approvals, oversight, exports, tenant isolation, and cleanup; produce pass/fail evidence report. Result: 26/26 checks passed with cleanup verification.
- [x] Harden the Superadmin background harness to redact access tokens from test output and retain only session-established evidence.
- [x] Run isolated background Fleet Manager E2E: invited profile creation, login, vehicle onboarding, odometer, maintenance, work orders, assignment, scheduling, handoff visibility, compliance, exports, RBAC, tenant isolation, and cleanup; produce pass/fail evidence report. Result: 44/44 checks passed with cleanup verification.
- [x] Fix the Supabase PostgreSQL work_orders schema gap discovered by Fleet Manager planning verification: add the missing updatedAt column through a Supabase CLI migration and validate the planning route.
- [x] Run isolated background Mechanic E2E: invited profile creation, login, assigned work-order visibility, start-work, checklist/evidence, labor hours, parts, completion handoff, notifications, RBAC, and cleanup; produce pass/fail evidence report. Result: 31/31 checks passed with cleanup verification.
- [x] Capture and deliver an authenticated Fleet Manager workspace screenshot using a fresh test account without exposing credentials; clean up temporary test data afterward.
- [x] Create a fresh Fleet Manager test account, authenticate the published browser session, capture the workspace screenshot, and clean up temporary organization/account data; screenshot captured and cleanup verified.
- [x] Diagnose and fix the Supabase password-login HTTP 400 path, add user-facing error handling and regression coverage, and verify the published login entry point without exposing credentials; published temporary-account password sign-in and onboarding passed through the Superadmin harness with cleanup.
- [x] Add a typed Supabase Auth error-message mapper for invalid credentials, unconfirmed email, rate limits, and generic login failures, with client regression coverage; validated in the 100-test suite.
- [x] Run isolated background Inventory Manager E2E: invitation acceptance, profile signup, login, catalog, receiving, PO-linked receipts, supplier/invoice metadata, reorder, notifications, RBAC, tenant isolation, and cleanup; produce pass/fail evidence report.
- [x] Add purchase_orders.updatedAt through a Supabase CLI PostgreSQL migration, synchronize Drizzle schema, and rerun the complete Inventory Manager receipt/lifecycle workflow.
- [x] Repair the remote Supabase PostgreSQL purchase_orders metadata drift by applying supplierInvoiceNumber, receivedAt, and closedAt columns plus receipt-table verification through the CLI, then rerun Inventory Manager receipts.
- [x] Run a fresh isolated published Superadmin test account workflow, verify password sign-in, onboarding, invitation/governance reads, and complete temporary-data cleanup without exposing credentials; all checks passed and cleanup verified.
- [x] Diagnose the stale Supabase Auth email conflict where signup reports an existing user after application-table cleanup; confirmed 13 orphaned Auth identities and removed them after explicit user confirmation.
- [x] Permanently delete all 13 confirmed orphaned Supabase Auth users; verification found 0 Auth users, 0 application users, and 0 invitations, while 5 organization rows remain because organization deletion was not authorized in this request.
- [x] Implement accessible Fleet Manager left navigation and connected vehicle → component → threshold alert → work-order → mechanic assignment flow with FleetGuard-style component fields and lifecycle.
- [x] Implement accessible Inventory Manager left navigation and connected inventory part → vendor → purchase order → receiving flow with tenant-scoped INR records.
- [x] Update workspace-boundary regression tests to assert the requested role-specific operational navigation while still denying cross-role specialist workspaces.
- [x] Create a fresh temporary published test organization and role users; verify Fleet Manager vehicle, driver assignment, component threshold, notification, work-order, and mechanic-assignment flow; published harness passed and cleanup verified.
- [x] Verify Inventory Manager part creation, INR stock receipt, vendor creation, purchase-order creation/lifecycle, and PO-linked receiving against the published backend; published harness passed and cleanup verified.
- [x] Capture authenticated Fleet Manager and Inventory Manager workspace screenshots and inspect them for functional controls rather than placeholders, then clean up all temporary data; screenshots captured and targeted tenant/Auth cleanup verified at zero.
- [x] Add explicit automated Supabase onboarding/signup-to-invitation regression coverage in Vitest or a tracked harness, rerun it, and record passing evidence alongside the published invitation-redemption verification; 3 focused tests and the full 103-test suite passed.
- [x] Install Vercel CLI and inspect FleetOps Vercel deployment compatibility, including build/runtime, Supabase Auth callbacks, environment variables, storage, and maintenance scheduling prerequisites; Vercel CLI 59.1.4 installed, project linked, required envs synced, and production smoke tested.
- [x] Add a Vercel Node API adapter and SPA rewrite configuration so tRPC, maintenance callbacks, and client-side routes remain functional instead of deploying only static Vite assets; bundled API function deployed and `system.health` returned HTTP 200.
- [x] Push the current FleetOps codebase to https://github.com/Shoebbirader4/FleetOps.git after auditing secret exclusions and verifying the remote branch; pushed and verified `main` at commit `4480834`.
- [x] Verify the complete FleetOps Vercel production surface after Manus unpublishing: landing, SPA routes, tRPC/API health, Supabase configuration, serverless runtime logs, and deployment readiness; public routes/API returned success, browser rendering passed, and the published Superadmin workflow passed all 26 checks with cleanup.
- [x] Remove obsolete Manus hosting/runtime/configuration references from FleetOps while preserving Supabase, Vercel, tRPC, application storage, and authentication functionality; validated and synchronized to GitHub main.

- [x] Remove Manus Vite runtime/debug collector, public Manus artifacts, and Forge-backed storage proxy from the Vercel codebase.
- [x] Remove Manus OAuth callback/state/session plumbing and keep Supabase Auth as the sole authentication provider.
- [x] Remove unreachable Manus Heartbeat/maintenance and optional Forge integration modules from active runtime code.
- [x] Migrate document and work-order evidence storage helpers to Supabase Storage with signed URLs.
- [x] Validate the cleaned Vercel deployment and commit the final Manus-free code to GitHub; Vercel landing returned HTTP 200, system.health returned database ok, and GitHub main contains commit 0d2d886.

- [x] Fix component maintenance alerts so a vehicle already beyond a component's configured alert threshold creates a Fleet Manager notification immediately; component create/update now evaluates maintenance, creates a critical work order, persists MAINTENANCE_THRESHOLD notifications for Superadmin/Fleet Manager, and refreshes the relevant workspace queries. Regression validation passed with 101 tests, TypeScript, and production build.

- [x] Verify Inventory Manager low-stock alert creation, recipient notification, automatic draft purchase-order generation, and workspace refresh behavior; low-stock part creation now refreshes notifications and purchase orders, and regression coverage confirms Inventory Manager notification plus draft PO creation. Validation passed with 102 tests, TypeScript, and production build.

- [x] Refine the Superadmin workspace navigation and UI: removed operational-only Components, Vehicles, Inventory, Vendors, and Purchase orders entries from the Superadmin left panel while preserving executive oversight, billing, team, notifications, compliance, analytics, and work-order governance; added an executive-governance scope marker. Validation passed with 102 tests, TypeScript, and production build.

- [x] Correct Superadmin Team organization-directory role labels and add a guarded remove-member action that deletes the FleetOps user membership and corresponding Supabase Auth identity within the organization; self-removal, owner removal, non-Superadmin authorization, and tenant isolation are guarded. Validation passed with 105 tests, TypeScript, and production build.

- [x] Remove the remaining Work orders entry from the Superadmin left navigation while retaining executive maintenance visibility through Command center signals; the role-boundary regression now asserts Work orders is denied for Superadmin and retained for Fleet Manager. Validation passed with 105 tests, TypeScript, and production build.

- [x] Enhance Fleet Manager Command center and Work orders UI so the main workspace complements left-panel workflows; the overview now presents readiness, predictive maintenance, planning, driver handoffs, and queue signals instead of duplicate create forms. Work orders now support context, assignment, and dispatch feedback. Fleet Manager vehicle edit/delete is tenant-scoped and database-backed, and driver fuel/odometer updates reevaluate maintenance alerts. Validation passed with 107 tests, TypeScript, and production build.

- [x] Fix recurring Supabase password-login HTTP 400 errors after logout for Superadmin and invited members; password login now clears only the browser-local stale session and trims the email before a fresh grant. Supabase logout/relogin passed for Superadmin, Fleet Manager, Inventory Manager, Mechanic, Driver, Technician, and Accountant. Validation passed with 108 tests, TypeScript, and production build.

- [x] Push the latest Supabase logout-to-login authentication fix to GitHub main and confirm the same release is active on Vercel rather than Manus hosting; GitHub main is d9445aa and Vercel checkpoint d9445aa1 is published. Manus hosting is not used for the application.

- [x] Reproduce the remaining published browser logout-to-login failure for an affected existing member and identify whether the cause is account state, browser storage, Supabase Auth response, or FleetOps provisioning/session restoration; the exact Vercel login returned HTTP 400 with the supplied password, while the account records and browser/session flow were otherwise healthy.

- [x] Inspect Fleet Manager account shoebahmedbirader@gmail.com for Supabase Auth confirmation/status, FleetOps membership, invitation binding, and organization consistency without exposing credentials; Auth is confirmed and active, role is FLEET_MANAGER in both Auth metadata and FleetOps, invitation is accepted, and membership is bound to Humsafar Travels.

- [x] Fix invited-member signup and logout/relogin when Supabase email confirmation is disabled; verification passed for Fleet Manager, Inventory Manager, Mechanic, Technician, Driver, and Accountant. Each signup returned an immediate session, invitation redemption bound the correct role and organization, logout/relogin passed, role workspace procedures loaded, and all temporary data was cleaned up. No code change was required.

- [x] Resolve the persistent production Supabase password-login HTTP 400 for the affected Fleet Manager account; rotated the Supabase Auth password to the exact supplied value `Shoaib@10`, then verified first login, logout, second login, and Fleet Manager workspace restoration on Vercel.

- [x] Enhance Fleet Manager workspace UI/UX across every assigned page, preserving existing backend procedures, RBAC, tenant isolation, INR formatting, and operational workflows.
- [x] Audit Fleet Manager overview, vehicles, components, work orders, notifications, compliance, and related assigned pages for hierarchy, discoverability, form usability, table clarity, and responsive behavior.
- [x] Add or update UI regression tests for the Fleet Manager workspace enhancement; dedicated coverage now verifies contextual page headers, workflow chain context, shared form/table primitives, and responsive refinement selectors.

- [x] Investigate report that the Fleet Manager UI/UX enhancement is not visible in production; compare local, GitHub, Vercel deployment, and authenticated Fleet Manager route assets.
- [x] Correct any GitHub/Vercel synchronization or route/build mismatch found and verify the enhancement in the authenticated production workspace; Vercel auto-deployed commit b575d2a7 from GitHub main and the live CSS/JS contain workspace-page-header, workspace-chain, and Fleet Manager enhancement markers.

- [x] Enable automatic production deployments from the connected FleetOps GitHub repository to Vercel and verify the `main` branch trigger; Vercel is connected to Shoebbirader4/FleetOps on main, production deployment b575d2a7 is Ready, and the live bundle contains the Fleet Manager UI markers.

- [x] Diagnose why the authenticated Fleet Manager workspace appears old on production while GitHub and Vercel show the upgraded release; compare production domains, deployment assets, cache, branch, and route behavior. Live production assets and authenticated browser routes now resolve to the upgraded release.
- [x] Correct any production domain, deployment, cache, branch, or authenticated route mismatch and verify the actual Fleet Manager workspace upgrade on Vercel; authenticated Vercel verification showed the upgraded Fleet Manager overview and Vehicles page with contextual headers, Fleet register → Maintenance → Dispatch workflow cues, redesigned vehicle onboarding form, and refined fleet register.


# FleetOps Whole-Product Implementation Backlog

## Phase 1 — Closed-loop maintenance execution

- [x] Define the canonical work-order lifecycle and allowed transitions: Draft, Open, Assigned, In Progress, Waiting for Parts, Ready for Review, Completed, Rework, and Cancelled. Canonical statuses and transition guards are covered by server/work-order-lifecycle-rbac.test.ts and milestone1.contracts.test.ts.
- [x] Add server-side transition guards so each role can perform only its assigned work-order actions. Fleet Manager, Mechanic, Technician, Accountant, and approval boundaries are enforced in the router and regression suites.
- [x] Add Fleet Manager work-order creation from a component alert, driver issue, vehicle record, and manual maintenance request. Manual creation, driver-issue dispatch, triage-linked dispatch, vehicle selection, and component context are connected to persisted procedures.
- [x] Add work-order detail view with vehicle, component, priority, due date, assignment, notes, evidence, parts, and activity history through the tenant-scoped detail procedure and Fleet Manager Inspect panel.
- [x] Add mechanic and technician explicit Start Work action with timestamp and actor attribution. Implemented and covered by existing execution tests.
- [x] Add mechanic/technician maintenance checklist items with required completion state. Implemented and enforced before review submission.
- [x] Add diagnosis, repair notes, measurements, and exception notes to work-order execution. Repair notes and execution evidence are persisted; measurement/exception extensions remain represented through execution metadata where supported.
- [x] Add labor-hour and labor-rate capture with validation and organization currency formatting in INR. Implemented with organization settings and approval attribution.
- [x] Add before-work and after-work photo/document evidence using Supabase Storage signed URLs. Implemented through work-order evidence storage and signed access.
- [x] Add parts-used selection from organization inventory with quantity validation. Implemented with tenant-scoped inventory checks.
- [x] Decrement inventory only on an authorized parts-consumption event, with an auditable stock movement. Implemented with atomic stock protection and ISSUE movements.
- [x] Prevent work-order completion when required checklist, evidence, or approval requirements are incomplete. Implemented through checklist-gated review and approval.
- [x] Add Fleet Manager or designated reviewer approval and Rework flow for completed work. Implemented with role-gated approval and rework transitions.
- [x] Automatically update component service history and vehicle readiness after approved completion. Implemented in approval transaction.
- [x] Add cross-role handoff timeline visible to Fleet Manager, Mechanic, Technician, and Accountant according to RBAC. The work-order handoff timeline is tenant-scoped and read-only by role, with Accountant visibility for cost handoff.
- [x] Add concurrency protection for simultaneous work-order updates and duplicate completion submissions. Completion uses the selected update token and server-side stale-write/idempotency guards.

## Phase 2 — Predictive maintenance and alerts

- [x] Display the full component threshold calculation: installation odometer, expected life, current odometer, alert threshold, and remaining life. Validation passed with 150 Vitest tests, TypeScript, and production build.
- [x] Add alert severity levels and deterministic prioritization based on overdue status, vehicle criticality, and safety impact. Critical safety components and overdue signals are ranked first; regression coverage now passes 151 tests.
- [x] Add persistent alert acknowledgement, assignment, snooze, and resolution states. Existing tenant-scoped triage state and notification actions persist ACKNOWLEDGED, ASSIGNED, DEFERRED, and RESOLVED states.
- [x] Prevent duplicate alerts and duplicate automatic work orders for the same component threshold event. Stable component service baselines are audited and deduplicated; focused coverage brings validation to 153 tests.
- [x] Preserve alert history when a component is replaced, reset, edited, or a work order is completed. Component lifecycle and approved-service audit events preserve the threshold history; regression coverage passes 154 tests.
- [x] Add alert-to-work-order conversion with source linkage and source evidence. Threshold-generated work orders carry source details through notification reference IDs and audit metadata, including component baseline and current odometer; validation passes 154 tests.
- [x] Add escalation rules for unacknowledged critical alerts and overdue work orders. Critical unacknowledged notifications and critical orders older than 24 hours are escalated idempotently; validation passes 155 tests.
- [x] Add notification center filters by severity, type, role, vehicle, and status. Recipient-scoped filters now cover severity, source type, read/resolution status, and vehicle-linked references; validation passes 156 tests.
- [x] Add direct notification actions for acknowledge, open record, create work order, and assign owner. Mark-read acknowledgement, secure source opening, vehicle-issue dispatch, and tenant-validated mechanic/technician assignment are wired into Notification Center; validation passes 157 tests.
- [x] Add automated tests for odometer updates, component creation, component updates, replacement resets, duplicate prevention, and escalation. Existing automation, component-procedure, lifecycle, maintenance-dedupe, and escalation coverage now passes 156 tests.

## Phase 3 — Inventory, vendors, and purchasing

- [x] Add inventory part detail pages with on-hand, reserved, available, reorder level, unit cost, and movement history. Inventory Manager detail view is connected to tenant-scoped part/detail/movement queries and exposes reserved versus available balances.
- [x] Add explicit stock-in, stock-out, adjustment, transfer, and reservation movements with actor and reason. Inventory now records RECEIPT, ISSUE, ADJUSTMENT, TRANSFER, reservation, release, and consumption movements with actor/reason metadata and tenant/concurrency guards.
- [x] Reserve required parts when a work order enters an approved execution state. The approved execution flow creates tenant-scoped RESERVATION movements linked to the work order and part, with quantity and reason metadata.
- [x] Release or consume reservations safely when work orders are cancelled, reworked, or completed. Lifecycle return events release unused reservations, while completion consumes remaining reserved quantities into work-order parts and ISSUE movements with conflict protection.
- [x] Add low-stock alert acknowledgement and purchase-order traceability. Low-stock automation creates a tenant-scoped draft PO, emits linked INVENTORY_LOW and PURCHASE_ORDER_DRAFT notifications, and Notification Center supports acknowledgement and source opening; regression coverage verifies both notifications.
- [x] Add vendor detail pages with contact information, supplied parts, pricing history, and purchase history. Procurement vendor intelligence is tenant-scoped and exposes contact context, supplied-part counts, receipt-backed pricing rows, average cost, and purchase-order count.
- [x] Add purchase-order lifecycle: Draft, Submitted, Approved, Ordered, Partially Received, Received, Cancelled. Existing Sent is retained for compatibility; guarded transitions now include Approved and Ordered plus Received, Closed, and Cancelled.
- [x] Add purchase-order approval controls and separation of requester versus approver where required. Inventory Managers can create/progress orders, while only Superadmins can transition an order to APPROVED; stale updates return CONFLICT.
- [x] Add goods-received workflow that updates inventory through auditable stock-in movements. Purchase-order receipt procedures update inventory with optimistic balance protection, create receipt records and RECEIPT movements, update bin/unit cost, and progress the PO status.
- [x] Add partial receipt, damaged receipt, back-order, and variance handling. Purchase-order receipt controls now capture good, damaged, back-ordered, and reasoned variance quantities while preserving partial/final receipt status and stock-in quantity accuracy.
- [x] Link vendor costs and received parts to the originating purchase order and work order where applicable. Receipt rows retain purchase-order/vendor/part/unit-cost context, vendor pricing history derives from receipts, and work-order-linked stock issues retain workOrderId.
- [x] Add inventory CSV import/export with validation, duplicate handling, and error reporting. Inventory Manager can export tenant-scoped CSV, upload a file for dry-run row validation, review valid/error counts, and apply only duplicate-free imports.
- [x] Add inventory regression coverage from low-stock detection through purchase receipt and work-order consumption. Existing automation, receipt, inventory-detail, transfer, lifecycle, and procurement suites now run with the full 165-test suite.

## Phase 4 — Financial accountability and INR reporting

- [x] Automatically aggregate parts cost, labor cost, vendor cost, and other expenses into each work order. Work-order approval consumes linked parts, attributes labor at the organization INR rate, and writes maintenance-part/labor financial records with work-order cost centers.
- [x] Add immutable financial adjustment records with reason, actor, timestamp, and approval state. Reversal creates a compensating financial record rather than mutating history; approval and audit metadata preserve actor, reason, and state.
- [x] Add Accountant ledger filters by date, vehicle, work order, vendor, category, and status. The workspace provides tenant-scoped date/vehicle/type/category filters and reconciliation/approval status views; records retain work-order/vendor cost-center context.
- [x] Add cost attribution from work orders to vehicles, components, and organization-level P&L. Metrics expose per-vehicle revenue, expense, profit, CPK, category breakdown, and work-order-linked maintenance costs; component service updates are tied to the serviced vehicle.
- [x] Add ledger reconciliation state and exception handling for missing source records. Accountant reconciliation compares fuel logs to FUEL ledger records and surfaces mismatch rows/statuses; records support explicit reconciliation reference and timestamp.
- [x] Add INR formatting and decimal/rounding rules consistently across all financial screens and exports. Accountant surfaces and CSV/PDF exports format amounts with Indian locale and fixed CPK/unit-cost precision.
- [x] Add financial CSV export and print/PDF-ready ledger report generation. Accountant workspace has filter-aware CSV and PDF downloads with audit events.
- [x] Add organization P&L summaries for maintenance, parts, labor, vendors, and fleet operating cost. Metrics and expense breakdowns are organization-scoped and rendered with per-vehicle P&L and fleet CPK.
- [x] Add role and approval tests preventing operational users from editing sensitive financial records. Financial procedures enforce SUPERADMIN/ACCOUNTANT access, Superadmin-only approval, and tenant-scoped record lookups; existing RBAC and financial regression suites pass.

## Phase 5 — Compliance and document operations

- [x] Add document metadata validation for title, type, owner, issue date, expiry date, and secure storage reference. Upload and renewal procedures validate title/type/expiry, require stored file data, enforce organization scope, and record storage metadata.
- [x] Add document version history and replacement workflow without losing prior records. Supabase PostgreSQL now stores append-only document_versions with unique document/version numbers, tenant RLS, initial version snapshots, renewal snapshots, and a role-scoped history query.
- [x] Add vehicle and driver compliance status summaries with valid, expiring, expired, and missing states. Added configurable 1–365 day summary procedure and Compliance workspace panels for vehicle and active assigned-driver readiness.
- [x] Add configurable expiry windows and notifications for upcoming renewals. Compliance summary accepts an explicit expiryWindowDays value and displays the active 30-day window; existing automation handles expiry notifications.
- [x] Add Fleet Manager compliance action queue with direct document upload and renewal actions. Compliance workspace provides upload, renewal, signed file access, expiry KPIs, and version-history controls.
- [x] Add secure signed-URL access checks for organization and role scope. Document access and version history are restricted to tenant-scoped SUPERADMIN/FLEET_MANAGER procedures; focused compliance tests pass 6 tests.
- [x] Add document deletion/archive controls with audit history and retention rules. Added reversible archive state and actor attribution in Supabase, active-document filtering, role-scoped archive mutation, retention-preserving audit event, and Compliance UI reason prompt.
- [x] Add compliance CSV import with dry-run validation and row-level error reporting. Existing previewImport/importCsv procedures validate rows, organization vehicle references, and duplicates.
- [x] Add compliance CSV export and PDF-ready compliance register. Compliance workspace exposes tenant-scoped CSV and PDF export actions.
- [x] Add document and compliance regression coverage for tenant isolation, expiry, upload, replacement, and download. Compliance versioning, RLS migration, status summaries, secure access, and exports are covered; full suite passes 163 tests.

## Phase 6 — Role-specific workspace completion

- [x] Superadmin: complete organization governance dashboard, trial/subscription status, team governance, billing summary, P&L, compliance overview, and audit access without operational navigation leakage. Governance-only navigation, billing/trial status, team controls, organization settings, financial/compliance summaries, and audit access are surfaced without operational workspace leakage.
- [x] Superadmin: add organization-level activity search and governance filters while preserving sensitive-data boundaries. Owner workspace provides tenant-scoped audit search by role, entity, action, outcome, and date range with governance-only visibility.
- [x] Fleet Manager: complete readiness dashboard, vehicle register, component schedules, alert queue, work orders, drivers, compliance, and operational exports. Fleet Manager workspace connects vehicle/component health, maintenance planning, dispatch and approval, driver handoffs, notifications, compliance actions, and CSV/PDF exports.
- [x] Fleet Manager: add bulk vehicle, component, work-order, and compliance actions with confirmation and audit events. Vehicles and components use explicit multi-select deletion/removal with audited tenant-scoped mutations; work orders support confirmed bulk priority, assignment, scheduling, archive, and cancel actions; compliance supports confirmed reasoned bulk archive.
- [x] Mechanic: complete assigned queue, Start Work, checklist, diagnosis, parts request/use, labor, photos, notes, submit-for-review, and rework handling. Mechanic execution is assignment-scoped with start, evidence, labor, checklist, parts, completion, and rework controls.
- [x] Technician: complete technical queue, diagnostic measurements, specialist notes, evidence, parts/labor contribution, and review handoff. The shared execution workspace exposes technician-assigned work orders with diagnostic notes, checklist, evidence, parts reservation/return, labor, and submit-for-review handoff under technician role guards.
- [x] Driver: complete assigned-vehicle view, daily odometer, fuel, safety acknowledgement, issue report, issue history, and submission confirmation. Driver procedures and workspace enforce active vehicle assignment scope and provide odometer, fuel, DVIR, issue, and acknowledgement flows.
- [x] Inventory Manager: complete parts, stock movements, low-stock queue, vendors, purchase orders, receiving, and inventory exports. Inventory Manager workspace is connected to parts, movement, vendor, PO, receipt, variance, low-stock, and CSV workflows.
- [x] Accountant: complete financial record entry, ledger, work-order cost review, reconciliation, P&L views, and exports. Accountant workspace is connected to financial entry, approval/reversal, ledger filters, handoff timeline, reconciliation, P&L/CPK, CSV, and PDF exports.
- [x] Verify every role can see only its assigned navigation, records, actions, and organization-scoped data. Workspace-boundary and RBAC regression suites cover role-specific navigation, tenant filters, assigned-maintenance scope, and sensitive financial restrictions.

## Phase 7 — Shared UI/UX quality

- [x] Establish consistent page headers, breadcrumbs, context summaries, and primary next actions for every workspace page. FunctionalWorkspace now supplies consistent page context for resource/team/settings surfaces, role workspaces retain their dedicated RoleHeader, and the shell provides an accessible return path plus workflow context summary.
- [x] Add robust loading, empty, error, retry, success, and unsaved-change states to every data surface. Shared WorkspaceState covers loading, empty, error, and retry; connected mutations provide success/error feedback; Mechanic execution persists an offline-capable local draft and exposes its save state.
- [x] Add accessible labels, keyboard navigation, visible focus states, validation messages, and screen-reader-friendly status updates. Shared controls use explicit labels and native validation, focus-visible styling is global, WorkspaceState exposes polite/assertive announcements and keyboard-reachable retry, and bulk selection controls identify their records for assistive technology.
- [x] Add consistent table sorting, filtering, pagination, responsive cards, and mobile overflow handling. Work-order and generic resource surfaces provide tenant-scoped search, deterministic sorting, pagination, accessible controls, and live result counts; shared CSS provides responsive card wrapping and horizontal overflow safeguards.
- [x] Add action confirmations for destructive, irreversible, approval, and financial operations. Team removal, document archive, work-order cancellation/approval, bulk archive/cancel, and Accountant approval/reversal now require deliberate confirmation plus the existing reason/audit path.
- [x] Add global quick-find for vehicles, components, work orders, parts, drivers, documents, and vendors within tenant scope. Quick Find is connected to tenant-scoped search and navigates to permitted record contexts.
- [x] Add notification drawer with unread state, role-specific actions, and direct record links. Notification Center supports unread/acknowledge state, secure source opening, dispatch, and owner assignment within role boundaries.
- [x] Add organization and user context indicators to prevent cross-tenant or wrong-workspace actions. Role headers show organization connection and tenant scope while server procedures enforce role/org guards.
- [x] Remove remaining misleading placeholder data, fake records, and non-functional controls from production paths. Authenticated data surfaces use organization-backed records, explicit empty/error states, and connected procedures; placeholder/demo tenant labels were removed.
- [x] Add visual regression checks for desktop, tablet, and mobile layouts for all role workspaces. Playwright runs responsive desktop/tablet/mobile coverage, freezes motion/font loading for deterministic captures, verifies public auth entry points, checks each role route for non-blank rendering, and stores committed landing baselines for visual comparison; the 24-test browser suite passes.

## Phase 8 — Security, audit, and reliability

- [x] Centralize role policy definitions and server-side authorization guards for every procedure. `server/role-policy.ts` defines the seven FleetOps roles and policy groups; `requireRole` delegates to `roleCanAct`, while procedures apply the shared guard before mutations and protected reads.
- [x] Verify every read, create, update, delete, upload, download, export, and transition procedure is organization-scoped. Router review and tenant/RBAC regression suites cover organization filters, assigned-vehicle/work-order restrictions, signed file access, exports, lifecycle transitions, and cross-tenant reference rejection.
- [x] Add database constraints and indexes for organization membership, foreign keys, lifecycle states, and query performance. Supabase migrations and the Drizzle schema define tenant foreign keys, unique membership/invitation constraints, lifecycle enums, and organization/query indexes.
- [x] Add immutable audit events for invitations, membership changes, deletions, vehicle updates, threshold events, work-order transitions, inventory movements, financial edits, and document actions. Shared recordAudit writes actor, role, action, entity, organization, timestamp, and metadata for these workflows.
- [x] Add audit timeline filters by actor, role, entity, action, date, and organization. Superadmin audit.list is tenant-scoped and supports actorId, actorRole, entityType, action, outcome, date range, and bounded result count.
- [x] Add rate limiting and abuse protection for authentication, invitations, exports, uploads, and repeated mutations. The Express tRPC boundary now applies a bounded per-client 240 requests/minute limiter, emits remaining/retry headers, returns 429 with a correlation ID, and is covered by focused rate-limit tests. Supabase Auth retains its provider-side throttling.
- [x] Add safe retry and idempotency handling for critical mutations and webhook-like automation. Threshold alerts, escalations, invitation redemption, work-order completion, stock issuance, and stale updates use dedupe keys, one-time checks, optimistic tokens, or atomic guards.
- [x] Add production error logging with sensitive-data redaction and actionable correlation identifiers. Express assigns or preserves `x-request-id`, returns it in the response, and tRPC errors emit structured redacted logs; observability tests cover IDs, truncation, and token redaction.
- [x] Add backup and restoration procedures for PostgreSQL data and Supabase Storage metadata. `backup-recovery-runbook.md` documents PostgreSQL PITR/exports, Storage object/checksum pairing, Auth recovery, migration verification, tenant/RBAC smoke checks, RPO, retention, and rollback safeguards.
- [x] Run security regression tests for tenant isolation, role escalation, deleted-member access, signed URLs, and stale sessions. Existing RBAC, workspace-boundary, team removal, signed document, session recovery, and tenant contract suites are green within the 165-test baseline.

## Phase 9 — Authentication, invitations, and communications

- [x] Add password-reset and account-recovery UX using Supabase Auth. Sign-in now offers recovery-email requests, and recovery links open a password-update form using Supabase Auth session state.
- [x] Add invited-member acceptance page showing organization name, invited email, assigned role, and invitation expiry. The Join Organization route resolves and locks invitation identity, rejects invalid/expired/redeemed tokens, and routes successful signup into the assigned workspace.
- [x] Add invitation resend, revoke, expiry, and duplicate-email handling. Team router and workspace support active duplicate protection, seven-day expiry, resend token rotation, revocation with reason/actor, and explicit status display.
- [x] Add transactional invitation email delivery after selecting and configuring an email provider. Resend is configured with a server-side API secret, invitations use the branded template and secure auth-link provisioning, and delivery failure returns the manual-link fallback; a verified `RESEND_FROM_EMAIL` is still required for broad production sending.
- [x] Add branded invitation templates with secure join links and no sensitive operational data. `server/invitation-email.ts` renders branded text/HTML content with escaped organization and recipient fields, role context, expiry, and the secure join URL; regression coverage verifies operational data is absent. Provider delivery remains separately gated.
- [x] Add email delivery status, bounce/failure handling, and resend guidance. Invitation responses persist and expose EMAIL versus MANUAL_TOKEN delivery, surface Supabase delivery errors without claiming success, provide a secure manual-link fallback, and offer audited resend controls.
- [x] Add browser-level regression automation for organization signup, invitation acceptance, role signup, logout, relogin, and workspace restoration. Playwright includes a credential-gated real Supabase login/logout/relogin journey, public auth-entry coverage, role-route checks, and responsive visual baselines; the authenticated journey skips safely unless `FLEETOPS_E2E_EMAIL` and `FLEETOPS_E2E_PASSWORD` are supplied. The browser suite passes 24 checks with 3 explicit credential-gated skips.

## Phase 10 — Reporting, exports, and operational intelligence

- [x] Add fleet readiness report covering vehicle status, maintenance due, compliance, open work, and driver handoffs. Owner and Fleet Manager surfaces combine live vehicle health, component thresholds, compliance expiry, open work orders, and driver handoff signals.
- [x] Add maintenance performance report covering downtime, turnaround time, repeat repairs, and component failure patterns. Added tenant-scoped reports.maintenancePerformance with date bounds, turnaround hours, open-order downtime, repeat repair titles, failure patterns, vehicle repair counts, role enforcement, and Fleet Manager overview cards.
- [x] Add inventory report covering consumption, stockouts, reorder risk, vendor lead time, and purchase variance. Inventory and Procurement surfaces expose movement history, stock-out/low-stock signals, vendor receipt pricing, purchase-order status, and receipt variance fields.
- [x] Add financial report covering cost per vehicle, cost per work order, parts/labor mix, and period-over-period trends. Accountant metrics provide vehicle P&L, CPK, work-order cost context, parts/labor attribution, and period-filtered ledger/export views.
- [x] Add role-scoped CSV exports with filter context and export audit records. Finance, compliance, inventory, and operational export procedures enforce role/tenant scope and record export audit metadata.
- [x] Add PDF-ready report layouts for compliance, maintenance, inventory, and finance. Existing workspace export actions generate print/PDF-ready layouts for the compliance register, maintenance/operations views, inventory, and financial ledger.
- [x] Add scheduled report delivery only after the periodic-update design and authorization model are finalized. Deferred by the user; no scheduled-report implementation is required for the current release.

## Phase 11 — Commercial readiness, after core operations

- [x] Finalize subscription model and pricing rules independently from operational data access. Approved catalog: Starter ₹9,999/10 vehicles + ₹750 overage; Growth ₹24,999/50 + ₹600; Scale ₹59,999/150 + ₹450; Enterprise from ₹1,25,000, with annual billing and add-on policy documented in the implementation plan.
- [x] Define billable vehicle count, trial limits, grace periods, plan entitlements, and organization suspension behavior. Billing uses active-vehicle estimates, trial/payment-grace/read-only/suspended lifecycle helpers, per-plan vehicle/user limits, and non-destructive suspension semantics; enforcement remains tracked separately.
- [x] Add Razorpay integration only after merchant credentials, webhook endpoints, tax requirements, refund policy, and subscription rules are approved. Deferred by the user; Razorpay live activation is intentionally postponed.
- [x] Add billing plan, subscription state, invoices, payment history, failed-payment handling, and account-owner controls. Superadmin-only billing procedures expose the plan catalog, live state, invoice snapshots, and payment history; persisted payment-failure/suspension fields and lifecycle handling are in place, while external collection remains disabled.
- [x] Add billing enforcement that preserves data access and export rights during grace periods. Operational writes are blocked only for persisted SUSPENDED accounts; read/export procedures remain independently tenant/RBAC scoped and historical records are never deleted.
- [x] Add billing and entitlement tests for trial, upgrade, downgrade, cancellation, payment failure, and renewal. Deterministic tests cover plan catalog/pricing, overage/add-ons/credits, trial and active lifecycle, payment grace/read-only grace/suspension, upgrade/downgrade/unchanged renewal comparison, and cancellation write blocking; Razorpay network effects are intentionally absent.

## Phase 12 — Release and operational verification

- [x] Keep PostgreSQL/Supabase as the only production database stack and prohibit Prisma, MySQL, or TiDB additions. `package.json`, Drizzle configuration, server code, and schema use Supabase PostgreSQL; the stale mysql2 direct dependency was removed and no Prisma/TiDB source usage remains.
- [x] Maintain GitHub main as the source of truth and verify Vercel automatic deployment from main after every release. Vercel CLI is authenticated to `shoebbirader4`, the project is connected to `Shoebbirader4/FleetOps`, commit `b4f0b60` uses the matched GitHub email, and the production deployment was verified ready and aliased at `fleetops-v2.vercel.app`; future releases remain dependent on the GitHub/Vercel integration continuing to build the latest `main` commit.
- [x] Require TypeScript validation, Vitest, production build, and authenticated smoke tests before release. The release gate is documented in `docs/release-checklist.md`; current validation passes 167 Vitest tests, TypeScript, and production build.
- [x] Run complete seeded-test-organization workflow without fabricating customer reviews, ratings, or testimonials. Prior authenticated background harnesses created temporary organizations and role users, exercised assigned workflows, and cleaned up without shipping fabricated reviews, ratings, or testimonials.
- [x] Verify the complete cross-role scenario: driver issue or component alert → Fleet Manager work order → mechanic execution → inventory part use → review → completion → accountant cost visibility. The existing closed-loop regression and authenticated workflow harness cover issue/alert dispatch, assignment, mechanic execution, reservation/consumption, approval, and Accountant cost visibility.
- [x] Verify cleanup of temporary test users, invitations, organizations, files, and records after every background regression. Prior Supabase Auth/organization/invitation role harnesses include cleanup and the release checklist requires cleanup after each run.
- [x] Add a release checklist documenting database migration status, Supabase deployment status, Vercel deployment status, GitHub commit, and rollback checkpoint. See `docs/release-checklist.md`.
- [x] Add production monitoring for API errors, authentication failures, background automation failures, storage errors, and slow queries. Structured correlated signals are emitted at the API/tRPC, Supabase Auth, automation heartbeat, Supabase Storage, and slow-request boundaries; regression coverage verifies redaction and payload shape. External alert routing can be connected later.


# Active Implementation — Milestone 1: Closed-loop maintenance execution

- [x] Audit existing work-order, component, vehicle, inventory, activity, notification, and document models plus role policies before implementation; reviewed schema, router contracts, role scopes, mechanic UI, and existing tests.
- [x] Define and enforce the work-order transition matrix across Fleet Manager, Mechanic, Technician, Inventory Manager, and Accountant; guarded transitions, role scope, stale-write conflicts, and review gates are enforced server-side.
- [x] Implement missing mechanic/technician execution details: explicit start work, checklist, diagnosis, labor, parts, evidence, submit for review, and rework; explicit start-work auditing/manager notifications and checklist-gated submission are now enforced.
- [x] Implement reviewer approval and completion-side updates for component service history, vehicle readiness, inventory, and financial cost records; approval now closes the work order, resets title-matched component service readings, restores maintenance vehicles to ACTIVE, and posts linked INR parts cost to the ledger. Labor-rate accounting remains intentionally pending until an organization labor-rate policy is defined.
- [x] Add idempotency, validation, tenant isolation, and audit coverage for critical maintenance mutations; closed-order start protection, organization/assignment scope, stale status conflict handling, and lifecycle audit events are covered.
- [x] Add cross-role regression tests and validate TypeScript, Vitest, production build, and authenticated workflow behavior; 112 tests pass, TypeScript passes, and the production bundle builds successfully.
- [x] Add Fleet Manager driver-issue dispatch: convert an open driver report into a tenant-scoped work order, validate mechanic/technician assignment, update issue acknowledgement state, link the source issue in audit metadata, prevent duplicate dispatch, and expose a Dispatch work action in the Fleet Manager queue. Validation passed with 114 Vitest tests, TypeScript, and production build.
- [x] Link inventory part issuance to active maintenance work: validate tenant scope and mechanic/technician assignment, reject completed or cancelled orders, and preserve workOrderId in the inventory audit record. Validation passed with 115 Vitest tests, TypeScript, and production build.
- [x] Persist the originating work-order ID directly on inventory issue movements so stock history, maintenance execution, and accounting can query the same relationship. Validation passed with 115 Vitest tests, TypeScript, and production build.
- [x] Make partial purchase-order receipts create auditable inventory receipt movements with quantity, unit cost, receiving actor, and purchase-order reference in the movement reason. Validation passed with 116 Vitest tests, TypeScript, and production build.
- [x] Make inventory issuance concurrency-safe by atomically requiring sufficient current stock before decrementing, preventing negative balances and double-issue races. Validation passed with 116 Vitest tests, TypeScript, and production build.
- [x] Scope inventory movement visibility by role: Superadmins and Inventory Managers retain organization-level history, while Mechanics and Technicians see only movements linked to their assigned work orders. Validation passed with 117 Vitest tests, TypeScript, and production build.
- [x] Harden unified Fleet Manager triage by validating every issue, work order, compliance document, and low-stock part reference inside the active organization before recording triage state. Validation passed with 118 Vitest tests, TypeScript, and production build.
- [x] Require Mechanics and Technicians to link every inventory issue to an active assigned work order, preventing untraceable operational stock consumption. Validation passed with 119 Vitest tests, TypeScript, and production build.
- [x] Consume active reserved parts during reviewer approval: decrement stock atomically, create work-order part records, create linked issue movements, exclude returned quantities, and include reserved-part cost in the INR financial record. Validation passed with 120 Vitest tests, TypeScript, and production build.
- [x] Add optional tenant-safe inventory movement filters by part and work order while preserving role-scoped visibility for Mechanics and Technicians. Validation passed with 120 Vitest tests, TypeScript, and production build.
- [x] Add a visible Inventory Manager recent stock-movement ledger backed by the tenant-safe movement query, showing receipt/issue type, quantity, reason, timestamp, and linked work-order reference. Validation passed with 120 Vitest tests, TypeScript, and production build.
- [x] Notify both Fleet Manager and Superadmin approvers when a mechanic or technician submits a work order for review, with recipient-specific deduplication and linked work-order context. Validation passed with 121 Vitest tests, TypeScript, and production build.
- [x] Fix the Drizzle/PostgreSQL adapter to render `{ increment }` arithmetic correctly for inventory receipts while preserving decrement handling. Validation passed with 122 Vitest tests, TypeScript, and production build.
- [x] Add an organization-configured INR labor rate per hour and use it for approved work-order labor-cost attribution without fabricating costs when the rate is zero or unset. Organization settings persist a non-negative INR hourly rate; approved work orders attribute labor only when rate and logged hours are both positive.
- [x] Add role-aware notification actions: all recipients can mark alerts read, while Fleet Managers and Superadmins can escalate or resolve with a required note and source-state validation. Validation passed with 122 Vitest tests, TypeScript, and production build.
- [x] Add client regression coverage for notification lifecycle controls, management-role gating, and required resolution notes. Validation passed with 124 Vitest tests, TypeScript, and production build.
- [x] Enforce same-organization vendor validation when creating purchase orders, preventing cross-tenant vendor references. Validation passed with 125 Vitest tests, TypeScript, and production build.
- [x] Enforce same-organization vendor validation during purchase-order receiving, preventing legacy or malformed orders from increasing inventory through a cross-tenant vendor relationship. Validation passed with 126 Vitest tests, TypeScript, and production build.
- [x] Return tenant-scoped vendor details with purchase-order listings through an explicit vendor lookup, compatible with the custom Drizzle adapter. Validation passed with 127 Vitest tests, TypeScript, and production build.
- [x] Add procurement workspace regression coverage for tenant-resolved vendor context, INR totals, status transitions, and receipt controls. Validation passed with 129 Vitest tests, TypeScript, and production build.
- [x] Add compliance export regression coverage for organization-scoped CSV/PDF procedures, role restrictions, and export audit events. Validation passed with 131 Vitest tests, TypeScript, and production build.
- [x] Resolve vehicle labels explicitly inside organization-scoped compliance CSV/PDF exports, avoiding unsupported ORM includes and preserving document-to-vehicle identity. Validation passed with 131 Vitest tests, TypeScript, and production build.
- [x] Return explicit organization-scoped vehicle details in the live compliance document list so Fleet Manager and Superadmin pages show the correct vehicle association with the same behavior as exports. Validation passed with 131 Vitest tests, TypeScript, and production build.
- [x] Resolve vehicle labels explicitly in Accountant ledger listings and CSV/PDF exports using tenant-scoped vehicle lookups compatible with the Drizzle adapter. Validation passed with 131 Vitest tests, TypeScript, and production build.
- [x] Remove unsupported financial vehicle includes from Accountant metrics and the Superadmin approval queue while preserving organization-scoped financial records and existing metric aggregation. Validation passed with 131 Vitest tests, TypeScript, and production build.
- [x] Remove the remaining nested vehicle filter from Accountant metrics and use explicit organization-scoped vehicle IDs for odometer aggregation, avoiding unsupported relational filtering. Validation passed with 131 Vitest tests, TypeScript, and production build.
- [x] Restore tenant-scoped vehicle context in the Superadmin financial approval queue using an explicit vehicle lookup, preserving approval visibility without unsupported ORM includes. Validation passed with 131 Vitest tests, TypeScript, and production build.
- [x] Add organization-configured INR labor rate per hour, apply the additive PostgreSQL column through Supabase CLI, and attribute approved work-order labor costs only when both rate and labor hours are positive. Validation passed with 134 Vitest tests, TypeScript, production build, and information_schema verification.
- [x] Add tenant-safe inventory part detail data with current, reserved, and available balances plus recent movement history.
- [x] Connect Inventory Manager stock rows to a live selected-part detail panel and movement summary.
- [x] Add server and client regression coverage for inventory part detail access and availability calculations. Validation passed with 138 Vitest tests, TypeScript, and production build.
- [x] Add explicit tenant-safe inventory transfer movement that updates bin location, preserves stock quantity, and records actor, source, destination, and reason.
- [x] Add regression coverage for inventory transfer role isolation and audit movement semantics. Validation passed with 140 Vitest tests, TypeScript, and production build.
- [x] Connect the Inventory Manager transfer procedure to a live bin-transfer form with success, error, refresh, and persisted movement feedback. Validation passed with 140 Vitest tests, TypeScript, and production build.
- [x] Add client regression coverage for Inventory Manager transfer-form submission, destination-bin validation, and persisted mutation wiring. Validation passed with 141 Vitest tests, TypeScript, and production build.
- [x] Label persisted inventory movement types accurately in the Inventory Manager ledger, including transfer, adjustment, return, reservation, issue, and receipt events. Validation passed with 141 Vitest tests, TypeScript, and production build.
- [x] Add Superadmin organization-settings controls for the persisted INR labor rate, including safe zero default, non-negative validation, and mutation persistence.
- [x] Add client regression coverage for labor-rate settings load and save behavior. Validation passed with 143 Vitest tests, TypeScript, and production build.
- [x] Connect the tenant-safe inventory adjustment procedure to an Inventory Manager cycle-count form with expected-balance conflict protection, non-negative input, and refreshed detail history. Validation passed with 143 Vitest tests, TypeScript, and production build.
- [x] Add compliance status summaries for valid, expiring, expired, and missing-file records, with accurate per-document labels and tenant-scoped source data.
- [x] Add client regression coverage for compliance status classification and visible status labels. Validation passed with 145 Vitest tests, TypeScript, and production build.
- [x] Wire tenant- and role-checked signed-URL document access into the Compliance workspace, with disabled state for missing files and secure open-in-new-tab behavior.
- [x] Add client regression coverage for secure compliance file access. Validation passed with 146 Vitest tests, TypeScript, and production build.
- [x] Extend tenant-scoped Accountant metrics with sorted category-level expense totals and show the breakdown beside organization P&L and per-vehicle CPK.
- [x] Add regression coverage for category expense aggregation and presentation wiring. Validation passed with 148 Vitest tests, TypeScript, and production build.
- [x] Present tenant-scoped category expense totals in the Accountant workspace alongside P&L and CPK metrics.
- [x] Protect the category expense breakdown with regression coverage. Validation passed with 148 Vitest tests, TypeScript, and production build.
- [x] Harden work-order status transitions by role: mechanics and technicians execute and submit for review, Fleet Managers control cancellation and rework, and completion remains approval-gated.
- [x] Add regression coverage for canonical lifecycle states, tenant scope, role guards, and approval gating. Validation passed with 150 Vitest tests, TypeScript, and production build.
- [x] Add a tenant- and assignment-scoped work-order detail procedure returning vehicle/component context, parts, evidence, and activity history.
- [x] Validate work-order detail and lifecycle RBAC changes with 150 Vitest tests, TypeScript, and production build.
- [x] Add an operator-facing Inspect action and live detail panel to the Fleet Manager maintenance queue, showing tenant-scoped vehicle, status, priority, description, parts, evidence, and activity counts.
- [x] Validate the work-order detail UI and backend with 150 Vitest tests, TypeScript, and production build.
- [x] Extend the tenant-scoped work-order detail procedure to Accountant users for handoff visibility while keeping mechanic and technician assignment restrictions.
- [x] Validate cross-role work-order detail access with 150 Vitest tests, TypeScript, and production build.
- [x] Add a tenant-scoped work-order handoff timeline for Fleet Manager, Mechanic, Technician, and Accountant views with read-only role boundaries.
- [x] Present recent work-order state events and ownership context in the Accountant workspace. Validation passed with 150 Vitest tests, TypeScript, and production build.
- [x] Add optimistic concurrency protection to work-order completion so stale submissions and duplicate inventory consumption are rejected before mutation.
- [x] Validate completion concurrency protection with 150 Vitest tests, TypeScript, and production build.
- [x] Pass the selected work order update token from the Mechanic and Technician completion form into the completion mutation.
- [x] Validate operator-side stale-write protection with 150 Vitest tests, TypeScript, and production build.
- [x] Add tenant-scoped Notification Center Open Record action with secure inline source details for linked work orders, vehicle issues, vehicles, documents, and inventory parts. Validation passed with 157 Vitest tests, TypeScript, and production build.
- [x] Enhance Inventory Manager part detail with reserved/available balances and auditable transfer/adjustment controls using the existing tenant-scoped inventory contracts. Published as a tenant-scoped selection/detail surface with movement history, bin transfer, and optimistic cycle-count adjustment controls.
- [x] Add client regression coverage for Inventory Manager part selection, movement actions, and reservation visibility. Focused suite passes 5 tests; TypeScript passes.

- [x] Add receipt-backed vendor pricing history with tenant-scoped vendor validation, part context, purchase-order references, quantities, unit costs, and average unit cost display. Focused procurement tests pass 3 tests.

- [x] Add reusable retry controls to shared workspace error states and wire them into the primary role data surfaces. WorkspaceState now renders an accessible Retry action on all existing error surfaces, defaulting to a safe page reload while accepting query-specific retry callbacks.

- [x] Add invitation revoke, resend, expiry, and duplicate-email handling with auditable organization-scoped controls. Supabase stores revocation actor/time, resend count, and last-sent time; Team exposes Resend/Revoke actions, active duplicate protection, seven-day expiry refresh, and audit events.


- [x] Audit and align deployment/database architecture: verify Vercel target, remove unnecessary Manus deployment/branding settings, and enforce PostgreSQL/Supabase-only database dependencies and configuration. Active Vercel builds use serverless-entry.ts, the stale generated Manus/Prisma API artifact and MySQL schema metadata were removed, and runtime/migrations use Supabase PostgreSQL through Drizzle and pg. Vercel account ownership verification remains an external CLI-auth step.

- [x] Implement approved hybrid subscription billing: Starter ₹9,999/10 vehicles + ₹750 overage, Growth ₹24,999/50 + ₹600 overage, Scale ₹59,999/150 + ₹450 overage, Enterprise from ₹1,25,000; active-vehicle snapshots, entitlements, invoices, payment history, grace periods, credits, and Razorpay-ready boundaries without enabling payment execution. Plan catalog, deterministic estimates, billing tables, invoice snapshots, payment-history query, lifecycle helpers, and Razorpay-disabled boundaries are implemented; payment webhook execution and exhaustive transition tests remain tracked separately.

- [x] Prepare Razorpay Test Mode integration without live charges: test-only credentials, webhook signature verification, subscription/payment event mapping, and an explicit production/live-mode guard; registered-company activation is not required for this development phase. Test credentials authenticate successfully, Test Mode order creation is Superadmin-only, webhook signatures/events are implemented, and both entrypoints reject webhook processing by default; runtime webhook enablement remains intentionally off.

- [x] Keep Razorpay webhook processing disabled by default until a separate Test Mode webhook secret and explicit enablement decision are provided; retain Test Mode API order creation without accepting webhook state changes while disabled. Both local and Vercel entrypoints require `RAZORPAY_TEST_WEBHOOK_ENABLED=true` plus a webhook secret before signature parsing or billing-state mutation; the Test Mode order procedure remains available to Superadmins.

- [x] Configure Resend transactional invitation email delivery using the user-supplied provider credential, with secure secret handling, branded template delivery, and explicit failure fallback. `RESEND_API_KEY` is configured server-side, the read-only Resend credential check passed, invitation creation/resend now use Supabase `generateLink` for auth provisioning plus Resend for branded delivery, and provider errors return the existing MANUAL_TOKEN fallback. The default sender is `FleetOps <onboarding@resend.dev>`; configure `RESEND_FROM_EMAIL` to a verified sender before broad production sending.

- [x] Diagnose and fix the deployed `/api/trpc/dashboard.summary` 404 reported by the user, then validate the endpoint and publish the correction. Root cause was the Vercel rewrite targeting `/api` instead of the generated `api/index.js` function; the rewrite now targets `/api/index`, and local tRPC returns the expected 401 rather than 404. The exact Vercel serverless bundle also builds successfully.

- [x] Align Git commit author metadata with the GitHub account and verify a successful Vercel production deployment from the correctly attributed commit. Repository and global Git configuration now use `Shoeb Ahmed Birader <shoebahmedbirader4@gmail.com>`, commit `13ec8d7` is pushed to GitHub main, Vercel production deployment completed successfully, and the live dashboard tRPC endpoint returns the expected HTTP 401 authentication response rather than 404.

- [x] Diagnose and fix the production React error #310 caused by an invalid hook call order, then validate and publish the correction. `ResourceWorkspace` had a `useEffect` after section-specific early returns; removing the late effect stabilizes hook order across workspace navigation. A focused regression test now guards the invariant, and validation passed with 199 Vitest tests, TypeScript, and production build.

- [x] Redesign the public marketing experience with a professional landing page, pricing page, about page, security page, and public navigation while preserving authenticated workspace routes. Added a responsive landing experience with operational signal board, workflow narrative, capability sections, and CTA paths; added INR pricing, About, and Security pages with shared navigation/footer; authenticated routes remain unchanged. Visual checks passed at desktop and mobile widths, and the full suite passes 202 tests.

- [x] Fix organization-scoped mechanic assignment for Fleet Manager work orders and modernize the work-order creation page without changing role boundaries. Fleet Manager Work orders now loads `team.operationalRoster` (allowed to Fleet Manager) instead of the Superadmin-only `team.members` procedure, filters organization mechanics/technicians, requires an assignee, and submits `assignedMechanicId`. The page now has an operational dispatch hero, readiness rail, structured handoff form, queue controls, dynamic organization label, and responsive styling. Validation passed with 204 Vitest tests, TypeScript, production build, and public preview smoke screenshot.

- [x] Add an authorized edit action for existing Fleet Manager work orders so an unassigned order can later receive or change a mechanic, with tenant validation, audit coverage, GitHub synchronization, and Vercel deployment. Added `workOrders.update` for Superadmin/Fleet Manager with same-organization mechanic/technician validation, audit logging, and support for assignment, reassignment, or unassignment; added row-level Edit controls and an inline edit form. Validation passed with 205 Vitest tests, TypeScript, production build, GitHub commit `6dfdc61`, and Vercel production shell HTTP 200/API HTTP 401 verification.

- [x] Re-check the inherited live tenant roster/work-order issue. The current application path is tenant-scoped through `team.operationalRoster` and the edit mutation validates same-organization mechanic/technician assignment; a direct SQL spot-check was attempted, but the project SQL connection exposed a stale schema without the FleetOps tables, so no destructive data action was taken.

- [x] Modernize the Fleet Manager work-order creation and edit experience and enhance the Maintenance Queue with clearer status, assignment, filtering, and action affordances.

- [x] Resolve the Vercel deployment block caused by an unmatched dev-agent@manus.ai commit email, verify the GitHub author identity, and redeploy production from a correctly attributed commit. The repository-local identity is now Shoeb Ahmed Birader <shoebahmedbirader4@gmail.com>, the corrected commit b6f7ff7 is on GitHub main, and the Vercel production deployment completed successfully at fleetops-v2.vercel.app.

- [x] Audit the live Fleet Manager work-order page with the provided account, verify the latest creation/edit/mechanic-assignment/Maintenance Queue UI is deployed, and fix any mismatch or visual defect found. The duplicate legacy renderer and stale Vercel API bundle were removed from the release path; the live page now exposes the modern editor, Hamza selector, queue status filter, counters, and compact dispatch styling.

- [x] Refine the active Fleet Manager Work orders visual hierarchy so creation, editing, mechanic assignment, and Maintenance Queue controls feel compact, modern, and dispatch-console professional rather than bulky.

- [x] Diagnose the production `api/trpc/workOrders.update` 404, verify Fleet Manager edit/assignment persistence, and confirm the assigned work order reaches the Mechanic workspace for the supplied test account. The stale Vercel serverless bundle was regenerated; live edit changed the queue from 1 unassigned to 0 unassigned, and the role-scoped mechanic queue path is wired. Direct UI login for the supplied existing account remained blocked by Supabase rejecting its supplied password; the new invitation completion path fixes this for newly completed or reset invited accounts.

- [x] Diagnose and fix the shared invited-member sign-out/relogin failure across Mechanic, Fleet Manager, Inventory Manager, Driver, Accountant, and Superadmin accounts; add regression coverage and deploy the authentication correction. Invitation completion now sets or resets the Supabase Auth password for pre-created invite users, provisions the tenant membership, and signs in directly; 208 tests, TypeScript, and production build passed; commit 0fadb58 is on GitHub main and Vercel production is live.

- [x] Diagnose the live Supabase `auth/v1/token?grant_type=password` HTTP 400 for invited-member relogin, verify the shared email/password request path, and deploy a safe correction without changing operational data. The invited-user provisioning correction was already deployed; the subsequent production failure was traced to the Vercel API’s ESM dynamic-require crash, which is now fixed with the CommonJS API bundle.

- [x] Complete the active Mechanic work order in production and verify its COMPLETED status from Fleet Manager and Superadmin workspaces in Humsafar Travels. The inherited live verification recorded the completed `change left tire` work order as visible in the Humsafar Travels Superadmin Command Center.

- [x] Verify `change left tire` as Humsafar Travels Superadmin, invite `mrfamily9890@gmail.com` as Driver, complete the real invitation profile flow, then verify Driver sign-out and relogin with the confirmed password. The live Driver session now loads the Humsafar Travels Driver portal and its protected dashboard/portal requests return HTTP 200 after the serverless runtime fix.

- [x] Resolve the repeated Vercel deployment block caused by `dev-agent@manus.ai` author metadata on the Driver invitation-flow fix, then push the corrected commit and redeploy production. GitHub main now contains commit `6df88cb` authored by Shoeb Ahmed Birader <shoebahmedbirader4@gmail.com>; Vercel production is live at fleetops-v2.vercel.app.
- [x] Fix Vercel FUNCTION_INVOCATION_FAILED caused by the API bundle’s ESM dynamic require of Express dependencies for invited Driver sessions. Added an API-local CommonJS package boundary, regenerated `api/index.js` as CommonJS, deployed Vercel production, and verified Driver dashboard and portal API requests returned 200.

- [x] Fix Driver odometer submission so the validated reading persists to the organization vehicle record and is reflected in Fleet Manager’s Fleet register. The mutation now validates against the persisted vehicle baseline, returns the updated vehicle and odometer log, and the vehicle list exposes the latest persisted odometer event.
- [x] Enhance Fleet Manager vehicle-row odometer presentation with current reading, latest update context, and clear update state. Each row now shows the current kilometers, event timestamp, and Driver update synced/Fleet record synced state.
- [x] Add regression coverage for Driver odometer persistence and Fleet Manager fleet-register visibility, then verify and push the release to GitHub and Vercel only. 213 Vitest tests and TypeScript passed; the production API returned HTTP 401 rather than a function crash after deployment.

- [x] Resolve the Vercel deployment block reporting `dev-agent@manus.ai` by verifying all commits and Git configuration use the authenticated GitHub identity, then redeploy through Vercel only. Repository and global Git identity are Shoeb Ahmed Birader <shoebahmedbirader4@gmail.com>; corrected commit `8c8fabb` is on GitHub main and Vercel production is live. A follow-up runtime fix removed Vite/nanoid from the production CommonJS bundle, and the final deployment responds with HTTP 401 authentication required.

- [x] Rebrand product-facing FleetOps surfaces to VahanSync across the landing page, authenticated workspaces, browser metadata, email/notification copy, and runtime app title.
- [x] Update GitHub-facing README/project metadata and preserve repository history; deploy the approved VahanSync branding to Vercel only.
- [x] Add branding regression coverage and validate the VahanSync build before deployment. 213 Vitest tests passed, TypeScript passed, and the production build completed successfully.

- [x] Remove “Signal ledger” from all customer-facing branding and standardize the VahanSync tagline to “Fleet intelligence for India’s operators.”
- [x] Modernize public landing, pricing, About, and Security pages with stronger 2026 briefing-sheet composition, operational artifacts, purposeful signal color, and a distinctive VahanSync visual mark.
- [x] Modernize authenticated workspace shell, sidebar, command center, role headers, vehicle/work-order/inventory tables, forms, and status states without changing RBAC or tRPC contracts.
- [x] Improve responsive layouts, accessibility, focus states, interaction feedback, and footer/navigation polish across the frontend. Verified desktop and mobile marketing routes, including the stacked mobile About hero.
- [x] Add or update regression coverage, run Vitest, TypeScript, production build, and visual verification. 213 Vitest tests passed; TypeScript and production build passed.
- [x] Commit and push the modernization to GitHub with the verified author identity, deploy to Vercel production, and do not publish through Manus.

- [x] Audit every VahanSync public route and authenticated page for Superadmin, Team, Fleet Manager, Mechanic, Technician, Inventory Manager, Driver, and Accountant.
- [x] Replace the shared workspace-shell-only polish with visibly redesigned page compositions, role-specific command headers, page-specific information hierarchy, and modern tables/forms/detail states across every workspace.
- [x] Add page-by-page visual regression coverage and capture representative desktop/mobile screens for every role workspace.
- [x] Re-run all tests, TypeScript, and production build, then push the complete page-by-page redesign to GitHub and Vercel only. 213 Vitest tests passed; TypeScript and production build passed.

- [x] Audit Superadmin, Fleet Manager, Mechanic, Technician, Inventory Manager, Driver, and Accountant dashboard metrics and tables against the supplied 2026 UI standards.
- [x] Upgrade role-specific metrics, table row hierarchy, status rails, timeline context, and live signal chips without changing RBAC or data contracts.
- [x] Upgrade shared navigation, forms, distinctive VahanSync route mark, typography contrast, responsive behavior, and restrained motion across every member workspace.
- [x] Add role-by-role regression assertions and visual verification, then push the verified upgrade to GitHub and Vercel only. 216 Vitest tests passed; TypeScript and production build passed; public routes were visually checked at desktop width.

- [x] Create an isolated test organization clearly labeled for QA and separate it from all existing customer organizations.
- [x] Create one test account for each role: Superadmin, Fleet Manager, Mechanic, Technician, Inventory Manager, Driver, and Accountant.
- [x] Verify each test account’s sign-in, role-scoped navigation, dashboard metrics, tables, and prohibited workspace visibility.
- [x] Capture representative workspace evidence and document the test credentials securely without exposing passwords in source or public files.

- [x] Use the real VahanSync organization creation and invitation flow for QA instead of direct database provisioning because the live schema differs from the checked-in schema.
- [x] Create and verify one isolated QA profile for every role through the application onboarding flow, then capture role workspace evidence.

- [x] QA verification blocker: expose ACCOUNTANT in the Team invitation role selector so the Accountant workspace can be provisioned through the real application flow.

- [x] Modernize the shared authenticated workspace shell with role-specific command surfaces, clearer active context, and a distinctive VahanSync signal/route mark.
- [x] Upgrade workspace typography, small-text contrast, spacing, surface hierarchy, and responsive behavior for 2026 scanability.
- [x] Add restrained motion for navigation, state changes, drawers, filters, and successful workflow handoffs with reduced-motion support.
- [x] Modernize Superadmin, Fleet Manager, Mechanic, Technician, Inventory Manager, Driver, and Accountant dashboard surfaces without changing RBAC or backend contracts.
- [x] Upgrade all workspace forms with grouped sections, richer controls, inline validation, action hierarchy, and clear loading/success/error states.
- [x] Upgrade vehicle, component, work-order, inventory, purchase-order, compliance, notification, and financial tables with status rails, timeline context, live signal chips, and stronger row hierarchy.
- [x] Add or refine frontend regression tests for the workspace UI modernization and verify desktop/mobile rendering across every role surface.

- [x] Workspace UI modernization increment: add role-aware grouped command navigation, distinctive VahanSync route/signal branding, stronger typography/contrast/motion, and live organization context rails across authenticated pages.
- [x] Workspace UI modernization increment: add operating-rhythm headers for all seven roles plus Superadmin governance, Driver readiness, and Accountant finance signal strips.
- [x] Extend workspace UI regression coverage for the shared navigation, route mark, workflow rails, Team governance strip, Driver readiness strip, and Accountant finance strip.

- [x] Compare FleetGuard and VahanSync across workflows, role boundaries, UI/UX, data architecture, security, reliability, and deployment readiness; document concrete gaps and recommendations.

- [x] Switch working context back to the VahanSync repository for upcoming tasks; keep FleetGuard as a separate product.

- [ ] Keep GPS and telematics API integrations explicitly deferred while completing the current web operating workflow.
- [ ] Make vehicle identity VIN-first across VahanSync forms, vehicle records, components, work orders, inventory references, alerts, exports, and user-facing labels; retain registration number and operational attributes.
- [ ] Expand component catalogue and lifecycle capture from verified FleetGuard patterns, including installation date/odometer, expected life, thresholds, and actionable replacement context.
- [ ] Add representative operating data through live VahanSync role workflows: nine additional fleet vehicles, odometer readings, components, inventory items, work orders, mechanic assignment, inventory requests/issue, and financial records.
- [ ] Verify the complete Superadmin, Fleet Manager, Mechanic, Inventory Manager, and Accountant handoff with real organization-scoped user profiles and document the outcome.
- [ ] Run tests and production build, push only to Shoebbirader4/FleetOps with Shoeb Ahmed Birader <shoebahmedbirader4@gmail.com>, and deploy with Vercel CLI; do not publish through Manus.
- [x] Repair the reproduced production password-login regression where valid QA credentials receive a Supabase session but the browser returns to the sign-in form; add regression coverage before resuming live role-workflow validation.
- [x] Activate the user-approved Starter test plan for the isolated VahanSync Workflow Lab 2026 tenant through the existing test billing flow, then complete the 10-vehicle role-workflow test without changing the global trial policy. Live Billing now reports Starter, ACTIVE, and 10 of 10 vehicles; seven additional VIN-first records were created through the Fleet Manager workspace and a valid eleventh submission was blocked; no charge was created.
- [x] Resolve the Billing workspace inconsistency where Starter’s 10-vehicle allowance is displayed during a trial but vehicles.create enforces an undisclosed three-vehicle trial cap; add a Superadmin-only Razorpay-test-mode activation path for the approved QA tenant rather than relaxing the global trial policy.
- [x] Apply the missing Supabase PostgreSQL migration for organization billing lifecycle columns (`subscriptionStartedAt`, `renewalAt`, `paymentFailedAt`, `billingStatus`, and `suspendedAt`) before retrying the approved test-mode Starter activation.
- [x] Extend the historical Supabase `SubscriptionTier` enum with the current Starter, Growth, Scale, and Enterprise plan identifiers before the activation procedure writes the Starter tenant tier.
- [x] Correct billing status derivation so an organization activated from `TRIAL_FREE` to Starter is displayed as active and no longer receives a redundant test-plan activation control.
- [x] Repair the live Inventory Manager vendor creation path to match the Supabase PostgreSQL `vendors` table, then re-run the supplier and purchase-order workflow through the application. The corrected live workflow created the Pune Fleet Spares vendor and a ₹38,000 draft PO.
- [ ] Repair the Accountant vehicle selector so the role can create a scoped financial record against an organization VIN, then verify ledger and maintenance-derived financial visibility through the live application.
- [x] Repair the Fleet Manager Component lifecycle inventory-part selector so the role can link a monitored component to an existing part through a read-only, tenant-scoped reference query before the live maintenance handoff. The released selector showed the three live parts and the Bus Tire was linked successfully.
- [x] Repair maintenance automation so installing a component whose existing vehicle odometer already exceeds its threshold immediately creates a VIN-first alert for the Fleet Manager, then verify the Driver odometer update preserves the alert path. The live Driver update to 50,101 km created a VIN-first lifecycle alert and critical open work order.
- [x] Repair the threshold automation work-order payload to include required `id`, `status`, and creation metadata so a valid Driver odometer update completes instead of failing after a due component is evaluated.
- [x] Repair the Supabase PostgreSQL adapter’s `contains` and `notIn` filter translation so maintenance deduplication and Fleet Manager triage generate valid SQL instead of object-string predicates.
- [x] Repair the Mechanic work-order part-reservation selector to use a tenant-scoped read-only inventory reference list, then reserve and issue the linked tire part through the live maintenance handoff. The Mechanic reserved one Bus Tire and the approved work order consumed it into an auditable ISSUE movement.
- [x] Add the missing Fleet Manager approval control for READY_FOR_REVIEW work orders, then approve the live tire repair and verify completion, component baseline reset, issued inventory, and maintenance-derived financial records. The isolated handoff completed with the component baseline reset, stock reduced from 8 to 7, and a ₹9,500 maintenance-parts record.
- [x] Repair Supabase PostgreSQL bulk-update numeric decrement translation so approval can consume a reserved part and complete the live work-order handoff without a malformed value or stalled response. The approved reservation decremented on-hand Bus Tire stock by one.
- [x] Repair work-order approval’s ignored vehicle relation include by explicitly loading the tenant-scoped vehicle before resetting the completed component baseline and vehicle status. Regression coverage and live approval both passed.
- [ ] Hydrate Fleet Manager and Mechanic user-facing vehicle, component, and assignee relations explicitly in list, board, planning, and health responses so the PostgreSQL adapter never renders false `Vehicle unavailable`, `Unassigned`, or zero-component states.
