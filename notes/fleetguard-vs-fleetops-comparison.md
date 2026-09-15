# FleetGuard versus FleetOps

## Executive conclusion

**FleetGuard is broader in architectural ambition; FleetOps is stronger as a currently verified, focused operating product for the exact multi-tenant Indian fleet workflow.** FleetGuard’s repository contains a larger surface area: separate web and mobile applications, Supabase Edge Functions, a Python ML service, GPS pages, analytics, subscription UI, vendor and purchase-order surfaces, data import, and a documented WatermelonDB offline-sync design. FleetOps has intentionally implemented a narrower product, but its current release is more tightly aligned to the core operational loop: organization onboarding, invitation-bound membership, role-specific workspaces, vehicle readiness, issue triage, work-order execution, inventory reconciliation, INR accounting, audit events, exports, and controlled offline drafts.

My practical recommendation is to **keep FleetOps as the product foundation** and selectively borrow FleetGuard’s strongest ideas—native mobile sync, GPS/route history, predictive maintenance, richer analytics, and more mature document operations—rather than replacing FleetOps with FleetGuard wholesale. FleetGuard should be treated as a valuable reference implementation and feature backlog, not as proof that every listed feature is production-complete.

## Side-by-side assessment

| Dimension | FleetGuard | FleetOps | Advantage |
|---|---|---|---|
| Product breadth | Broad repository spanning web, mobile, Supabase functions, ML service, GPS, analytics, vendors, subscriptions, imports, and documents. | Focused operational SaaS covering the highest-value fleet handoff loop with seven role-specific workspaces. | FleetGuard for breadth; FleetOps for focus. |
| Core workflow | Documents describe many workflows, but the remaining-feature plan still lists major work for GPS, predictive maintenance, fleet health, and route visualization. | The current release verifies Fleet Manager → Mechanic handoff, issue triage, execution evidence, inventory consumption, and shared status visibility. | FleetOps for verified core execution. |
| Tenant isolation and RBAC | Uses Supabase/RLS-related SQL and role-aware web navigation; repository contains multiple policy and auth guides. | Uses organization-bound onboarding, server-side role guards, tenant-scoped Drizzle queries, RLS-oriented schema design, isolated workspace UI, and regression assertions. | FleetOps for explicit end-to-end boundary verification; FleetGuard has broader policy material. |
| Roles | Web code and documentation indicate manager, mechanic, driver, inventory, accountant, and administrative surfaces, with role selectors and workspace-specific pages. | Superadmin, Fleet Manager, Inventory Manager, Mechanic, Technician, Driver, and Accountant have dedicated role workspaces and tested access boundaries. | FleetOps for the stated seven-role matrix. |
| Fleet Manager operations | Has vehicle, driver, work-order, purchase-order, maintenance, analytics, GPS, and dashboard surfaces. | Has vehicle onboarding, odometer history, component schedules, compliance, driver assignment, issue triage, work-order dispatch, Kanban board, vehicle health details, and oversight alerts. | Tie on scope; FleetOps has stronger current handoff verification. |
| Mechanic operations | Mobile guide covers work orders, parts, labor, service history, and offline operation. | Has visible Start Work, labor hours, repair notes, evidence attachments, assigned-order scope, inventory consumption, and completion notifications. | FleetGuard for mobile breadth; FleetOps for published web workflow verification. |
| Inventory | Repository includes inventory pages, receiving UI, spare-part forms, vendors, purchase orders, and documented inventory workflows. | Has receipt/issue transactions, movement ledger, insufficient-stock protection, audit events, and role-safe controls. | Tie; FleetGuard appears broader, FleetOps is more tightly reconciled and tested. |
| Driver | Has driver pages, assignments, inspections, and mobile/offline documentation. | Has assigned-vehicle-only odometer, DVIR inspection, fuel log, vehicle issue reporting with urgency/photo evidence, and locally saved drafts. | FleetGuard for native mobile foundation; FleetOps for current tenant-safe workflow closure. |
| Accounting and INR | Contains financial widgets, cost-tracking documentation, subscription pages, and money helpers; the inspected repository does not establish the same INR ledger closure as FleetOps. | Has revenue/expense entry, detailed INR ledger, signed amounts, vehicle/category/date dimensions, and CSV/PDF export controls. | FleetOps. |
| Audit and secure files | FleetGuard has audit-log pages and extensive encryption, privacy, backup, and compliance documentation. | FleetOps records organization-wide audit events for invitations, role changes, vehicles, work orders, triage, inventory, financial records, documents, files, and completion; signed file access is role- and tenant-checked. | Tie in ambition; FleetOps has more directly connected operational event coverage. |
| Offline capability | Strongest area in FleetGuard’s design: WatermelonDB local storage, bidirectional sync, connectivity triggers, periodic background sync, queue tracking, retries, and last-write-wins conflict handling are documented for mobile. | Current release has browser local draft persistence and explicit offline status for Driver issue reports and Mechanic/Technician execution notes; it is not yet a full bidirectional sync engine. | FleetGuard clearly. |
| GPS and telematics | Has a dedicated GPS tracking page and a detailed remaining plan for live markers, route history, geofences, clusters, vehicle details, and realtime updates. | Has odometer readings and maintenance telemetry but not the same full GPS/geofence product surface. | FleetGuard. |
| Predictive maintenance | Includes a Python ML service, feature engineering, fleet-health modules, and predictive-maintenance documentation. Its remaining plan still lists ML integration, prediction persistence, fleet-health calculation, model confidence/versioning, and scheduled prediction work. | Has deterministic component schedules, health details, odometer-based signals, alerts, and readiness summaries, but no ML service. | FleetGuard for potential; neither should be called fully production-complete for predictive maintenance solely from repository inspection. |
| Reporting and exports | Has documents, data import, analytics, and compliance guides; actual export breadth was not fully runtime-verified in this comparison. | Has tenant- and role-safe CSV and PDF reporting for financial and compliance records, with browser states and audit events. | FleetOps for verified exports. |
| Testing evidence | Many web component/page tests, integration tests, mobile tests, ML tests, and notification tests are present in the repository. | 62 Vitest tests pass; role lifecycle harnesses and a 14/14 published onboarding/invitation flow have passed, with cleanup paths. | FleetOps for end-to-end evidence; FleetGuard for test-surface breadth. |
| Deployment readiness | Has Vercel, Supabase, Docker, mobile, and ML deployment material, but the remaining plan and multiple fix/diagnosis documents indicate ongoing integration work. | Published on Manus hosting with a stable validated checkpoint and documented edge-cache caveat from earlier verification. | FleetOps for current operational simplicity; FleetGuard for deployment options. |

## What FleetGuard does better

FleetGuard’s clearest advantage is **breadth beyond the immediate workflow core**. Its repository is organized as a multi-surface platform rather than only a web application. The mobile application has a documented local database and synchronization engine, while the ML service gives FleetGuard a path toward component failure prediction and fleet-health scoring. The web application also contains dedicated GPS tracking, analytics, data import, vendors, purchase orders, subscription, maintenance-calendar, and settings surfaces. These are meaningful product capabilities, not merely visual polish.

FleetGuard is also stronger as a **future platform architecture**. Its documentation addresses encryption, backup and recovery, caching, GDPR/privacy, notification configuration, deployment, mobile responsiveness, and offline behavior. For a large operator with drivers and mechanics working in low-connectivity environments, the WatermelonDB approach is materially more capable than FleetOps’s current browser-local draft approach.

## What FleetOps does better

FleetOps is stronger in **operational closure and evidence of correctness**. The current product is built around a clear Issue → Triage → Execution → Reconciliation loop. A Fleet Manager can dispatch work, a Mechanic or Technician can start and complete assigned work with labor and evidence, inventory can be consumed, and the organization can see the shared resulting state. The same release includes audit events and authorized file access, which makes the workflow more defensible for a B2B operator.

FleetOps is also stronger in **strict role/workspace discipline as a product requirement**. The seven roles have deliberately separated workspaces, and the validation suite tests both allowed and denied procedures. The organization-bound invitation flow is explicit: invited users receive an organization-scoped token, see the organization and email during onboarding, create their profile, and enter the designated workspace. That is closer to the requested responsibility matrix than a broad collection of pages is by itself.

Finally, FleetOps is currently more disciplined around **INR-native financial operations and controlled exports**. It provides INR financial entry and ledger behavior plus CSV/PDF exports under tenant and role checks. FleetGuard has financial and cost-tracking surfaces, but the inspected repository evidence does not establish the same complete and verified INR ledger workflow.

## Important caveats

This is a repository and product-baseline comparison, not a claim that every FleetGuard feature was executed in a live production account. FleetGuard’s own `IMPLEMENTATION_PLAN_REMAINING_FEATURES.md` marks substantial GPS, predictive-maintenance, fleet-health, and ML-integration work as remaining. Therefore, FleetGuard should not be scored as if every page, function, or guide represented a finished production feature.

Likewise, FleetOps’s current offline capability should be described precisely. It is **offline-ready draft persistence**, not full offline-first synchronization. FleetGuard’s documented WatermelonDB design is materially ahead in queueing, pull/push sync, conflict handling, and background synchronization. That is the most important technical gap FleetOps should address if the product is intended for real depot and road use.

## Recommendation

If the decision is which codebase should be the product foundation today, choose **FleetOps**. It is narrower, but it is more coherent with the agreed responsibility matrix, has stronger evidence for the critical cross-role workflow, and is already published with tenant-safe operational controls.

If the decision is which codebase contains more future-facing platform ideas, choose **FleetGuard**. Its mobile, GPS, ML, analytics, and platform-governance surfaces give it a higher ceiling, but the unfinished implementation plan means that ceiling is not the same as present readiness.

The best combined roadmap is to preserve FleetOps’s domain model and RBAC boundaries, then adopt FleetGuard-inspired capabilities in this order: first a real mobile offline sync engine; second GPS/location and route history; third deterministic fleet-health scoring; fourth predictive-maintenance integration with explicit confidence and model-version metadata; and fifth richer analytics and import/export operations. Razorpay billing should remain a separate commercial milestone rather than being used to judge the operational quality of either codebase.

## Current ratings

| Category | FleetGuard | FleetOps |
|---|---:|---:|
| Current core workflow readiness | 7.5/10 | **8.8/10** |
| Role/RBAC alignment to the agreed matrix | 7.8/10 | **9.0/10** |
| Mobile/offline capability | **9.0/10** | 6.5/10 |
| GPS/telematics breadth | **8.5/10** | 5.5/10 |
| Predictive-maintenance potential | **8.5/10** | 6.0/10 |
| Audit and governance documentation | **8.5/10** | 8.2/10 |
| Verified end-to-end evidence | 7.0/10 | **9.0/10** |
| INR accounting and controlled exports | 7.0/10 | **8.8/10** |
| Overall present product readiness | 7.6/10 | **8.6/10** |
| Overall future platform ceiling | **8.9/10** | 8.4/10 |

These ratings are engineering judgments based on the inspected source, documentation, current FleetOps validation records, and the distinction between implemented behavior and planned scope. They are not market benchmarks or independent security certifications.

## References

[1]: https://github.com/Shoebbirader4/fleetguard "FleetGuard repository"
[2]: https://github.com/Shoebbirader4/fleetguard/blob/master/README.md "FleetGuard README"
[3]: https://github.com/Shoebbirader4/fleetguard/blob/master/IMPLEMENTATION_PLAN_REMAINING_FEATURES.md "FleetGuard remaining implementation plan"
[4]: https://github.com/Shoebbirader4/fleetguard/blob/master/mobile/OFFLINE_SYNC_GUIDE.md "FleetGuard offline sync guide"
[5]: https://github.com/Shoebbirader4/fleetguard/blob/master/mobile/MANAGER_APP_GUIDE.md "FleetGuard manager mobile guide"
[6]: https://github.com/Shoebbirader4/fleetguard/blob/master/mobile/MECHANIC_APP_GUIDE.md "FleetGuard mechanic mobile guide"
[7]: https://github.com/Shoebbirader4/fleetguard/tree/master/ml-service "FleetGuard ML service"
[8]: https://fleetops-elktaacw.manus.space/ "FleetOps published application"
