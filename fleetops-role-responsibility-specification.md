# FleetOps Role and Responsibility Specification

**Document purpose.** This specification consolidates the responsibilities assigned to every FleetOps organization member from the original product definition through the later workspace, RBAC, workflow, and audit improvements. It distinguishes the seven authenticated roles from cross-functional capabilities, describes what each role may do, identifies the operational handoffs between roles, and records what is implemented, partially implemented, deferred, or intentionally restricted.

> FleetOps is a multi-tenant B2B SaaS for Indian fleet and bus operators. Each user belongs to an organization, receives one designated role, and is confined to that role’s workspace and tenant-scoped backend procedures. Organization-wide workflows connect the roles without allowing unauthorized access to specialist data.

## 1. Organization-wide security and operating model

FleetOps uses organization isolation as the primary data boundary. A user can read and mutate only records belonging to the organization associated with the authenticated FleetOps membership. The server, not only the frontend, enforces the organization scope and role permissions. Direct navigation to another role’s workspace does not grant access.

The seven authenticated roles are **Superadmin / Organization Owner, Fleet Manager, Inventory Manager, Mechanic, Technician, Driver, and Accountant**. The original responsibility matrix described Mechanic and Technician together because they share the physical execution mandate; the current product treats them as separate role identities with the same core execution boundary and independently assigned work queues.

| Role | Primary workspace | Organization relationship | Main data boundary |
|---|---|---|---|
| Superadmin / Organization Owner | Executive Command Center | Governs the organization and approves high-impact actions | Organization-wide oversight, governance, approvals, and billing visibility |
| Fleet Manager | Fleet Manager workspace | Runs daily fleet readiness and maintenance operations | Vehicles, assignments, issues, work orders, maintenance, compliance signals, and handoffs |
| Inventory Manager | Inventory / Procurement workspace | Controls parts, stock, suppliers, and purchase orders | Parts, balances, movements, receipts, locations, vendors, and purchase orders |
| Mechanic | Mechanic execution workspace | Performs assigned repair work | Assigned work orders, checklists, labor, evidence, and authorized parts usage |
| Technician | Technician execution workspace | Performs assigned technical work | Assigned work orders, checklists, labor, evidence, and authorized parts usage |
| Driver | Driver workspace | Operates assigned vehicles and reports field conditions | Assigned vehicles, DVIR, odometer, fuel, trips where available, and issues |
| Accountant | Accountant workspace | Maintains financial records and operational profitability | INR ledger, approvals, GST/TDS metadata, reconciliation, P&L, CPK, and reports |

Every important action is intended to be auditable. Examples include invitations, role changes, vehicle onboarding, assignments, issue triage, work-order transitions, inventory receipts and consumption, document changes, financial entries, approvals, reversals, and exports.

## 2. Superadmin / Organization Owner

### Core mandate

The Superadmin is the executive owner of the organization. This role establishes the organization, governs membership, monitors organization-wide operational health, manages approvals, reviews financial and compliance exposure, and controls subscription visibility. The Superadmin is not intended to perform every specialist task manually; instead, the role has oversight and approval responsibility while specialist roles execute their designated work.

### Original responsibilities

The Superadmin registers the company from the public onboarding flow, creates the initial account, and completes organization setup. The original commercial model included a seven-day trial and future vehicle-based subscription tiers of ₹300, ₹500, and ₹800 per vehicle per month through Razorpay; Razorpay checkout remains intentionally deferred, while trial and subscription-state foundations are present.

The Superadmin invites staff through secure organization-bound invitations, selects their role, monitors invitation status, and audits team activity. The invitation flow binds the invited email, organization, and assigned role before profile creation; the invited user then creates a password and enters the designated workspace.

The Superadmin reviews organization-wide fleet readiness, operational alerts, high-level P&L, vehicle metrics, compliance exposure, inventory risk, work-order state, and team capacity. The role can view organization-wide summaries and approve high-impact actions without becoming a Fleet Manager, Inventory Manager, Mechanic, Technician, Driver, or Accountant in the access model.

The Superadmin oversees the document vault for company, vehicle, and driver legal records, including registration certificates, insurance, fitness certificates, permits, and expiry alerts. The role also receives organization-level signals when work is completed, stock is low, critical issues are unresolved, or approvals are required.

### Expanded governance responsibilities

The Superadmin’s expanded responsibility set includes the following capabilities:

| Responsibility area | Required responsibility |
|---|---|
| Organization lifecycle | Create and maintain organization identity, operating settings, timezone, fiscal year, currency, depot information, notification policy, and retention policy. |
| Team lifecycle | Invite, assign, update, deactivate, reactivate, and audit organization members; revoke or resend invitations; show last activity; transfer ownership only with explicit confirmation. |
| Audit and accountability | Search organization audit events by actor, role, action, entity, date, outcome, and source. |
| Executive drill-down | Open KPI results into filtered vehicle, work-order, compliance, inventory, or financial views rather than stopping at summary cards. |
| Approval center | Approve high-value expenses, manual adjustments, critical work orders, high-value inventory adjustments, and document exceptions. |
| Capacity and plan oversight | Monitor vehicle and user usage, trial state, capacity limits, projected consequences, write-freeze state, and future billing entitlements. |
| Compliance oversight | Review expiring or missing documents, retention state, secure file access, and compliance exports. |
| Operational escalation | Review critical notifications, unresolved driver issues, blocked maintenance, low-stock signals, and escalation state. |
| Reporting and export | Access organization-wide INR, compliance, fleet, and operational reports within the available export scope. |
| Organization archive | Future responsibility to export and archive organization data through a controlled deletion and recovery process. |

### Restrictions

The Superadmin has global administrative visibility but should not use that visibility to bypass specialist responsibility boundaries. The role may approve or oversee a work order without impersonating a Mechanic. It may inspect organization-level inventory or financial data, but operational mutations remain governed by their specific procedures and approval rules. Razorpay payment execution is not currently active.

## 3. Fleet Manager

### Core mandate

The Fleet Manager is responsible for daily asset performance, maintenance planning, vehicle readiness, issue triage, driver coordination, and repair dispatch. This is the organization’s operational control-tower role.

### Original responsibilities

The Fleet Manager onboards buses and trucks using registration, VIN, make, model, year, and current odometer data. The role may apply the City Bus maintenance template or equivalent maintenance templates to initialize high-wear components such as engine oil, brakes, tires, and other service items.

The Fleet Manager monitors mileage from driver logs and future GPS or telemetry integrations, validates odometer anomalies and rollbacks, watches component life thresholds, and responds to maintenance alerts. The role creates and dispatches work orders, selects priority, assigns Mechanics or Technicians, and follows the order through execution, review, rework, approval, completion, or cancellation.

The Fleet Manager manages driver-to-vehicle assignments, reviews driver handoffs, monitors safety disposition, oversees trip or route context when available, and coordinates maintenance availability with operational readiness. The role also reviews documents, compliance signals, vehicle health, open defects, low stock, and maintenance backlog.

### Expanded responsibilities

| Responsibility area | Required responsibility |
|---|---|
| Vehicle register | Create vehicles with registration, VIN, make/model/year, odometer, status, and maintenance-template controls; maintain vehicle readiness context. |
| Vehicle health | Combine odometer trend, component life, DVIR failures, fuel efficiency, open work, compliance, and vehicle cost into a usable health view. |
| Component planning | Monitor mileage-based and time/document-based due dates; plan work over 30-, 60-, 90-, and 180-day horizons. |
| Issue triage | Receive Driver reports, failed DVIR signals, predictive alerts, expiring-document alerts, and low-stock signals in a prioritized queue. Acknowledge, assign, defer, resolve, or escalate those items. |
| Work-order creation | Create an order with vehicle, symptoms, title, priority, safety context, and operational reason. |
| Work-order dispatch | Assign a Mechanic or Technician, set and change priority, schedule or reschedule the order, and communicate the operational expectation. |
| Work-order lifecycle | Move orders through OPEN, IN_PROGRESS, WAITING_FOR_PARTS, READY_FOR_REVIEW, REWORK, COMPLETED, and CANCELLED states subject to transition and approval rules. |
| Bulk operations | Select multiple orders and bulk assign, schedule, reschedule, change priority, cancel eligible orders, archive or unarchive, and export order rows. |
| Execution review | Review checklists, labor, repair notes, evidence, parts, and completion readiness; approve, request rework, reopen, or reject completion with a reason. |
| Driver handoff | See the reporting Driver, acknowledgement timing, latest issue, safety disposition, and whether the vehicle is safe, unavailable, or released. |
| Assignment coordination | Manage driver-to-vehicle assignments and prevent unsafe or conflicting assignments. |
| Compliance | Review vehicle documents, expiry dates, missing metadata, renewal state, and compliance reports. |
| Operational reporting | Export work-order and compliance information and review fleet readiness and maintenance backlog. |

### Restrictions

The Fleet Manager cannot alter financial ledgers, manage Accountant approvals, change billing settings, or administer inventory balances outside authorized work-order parts interactions. The role may request parts through a work order and see availability signals but does not own supplier payment or the full stock ledger.

## 4. Inventory Manager

### Core mandate

The Inventory Manager owns the spare-parts catalog, stock quantities, storage locations, supplier relationships, purchase orders, receiving, issuing, returning, adjustment, and reorder decisions.

### Original responsibilities

The Inventory Manager maintains part names, SKUs, unit costs in INR, bin locations, quantities on hand, and minimum reorder thresholds. The role monitors stock in real time, responds to low-stock signals, reviews automatic draft purchase orders, manages vendors, and updates purchase-order states from Draft to Sent to Received.

### Expanded responsibilities

| Responsibility area | Required responsibility |
|---|---|
| Parts catalog | Create and maintain parts, SKU, name, unit cost, minimum reorder level, bin/location, lead-time context, and supplier relationship. |
| Stock integrity | Receive, issue, return, adjust, transfer, reserve, and consume stock while recording actor, quantity, reason, cost, timestamp, and reference. |
| Concurrency control | Prevent negative stock and concurrent overwrites; surface explicit conflict errors and require a controlled adjustment workflow. |
| PO-linked receiving | Receive against a purchase order, record partial quantities, supplier invoice number, storage location, received-by user, receipt history, and final-receipt state. |
| Issue and return | Issue parts to an authorized work order, return unused parts, and correct counts with a reason. High-value adjustments require approval where configured. |
| Purchase-order lifecycle | Manage Draft, Sent/Submitted, Partially Received, Received, Closed, and Cancelled states with supplier history and receipt linkage. |
| Reorder intelligence | Review current stock, reserved stock, open purchase orders, average consumption, lead time, and safety-stock signals. |
| Inventory detail | Inspect movement history, average cost, last purchase price, supplier, reorder level, open purchase orders, and related work orders. |
| Location control | Maintain depot, warehouse, bin, shelf, and transfer context where the location model is enabled. |
| Reporting | Export or review stock, valuation, receipt, movement, and purchase-order information within the available reporting scope. |

### Restrictions

The Inventory Manager cannot dispatch maintenance work orders, assign Drivers, approve organization-wide financial records, or access per-vehicle P&L beyond information necessary for a stock transaction or related work order. Inventory pricing and supplier data remain restricted from Mechanic, Technician, Driver, and ordinary Fleet Manager operations.

## 5. Mechanic

### Core mandate

The Mechanic performs physical repairs, inspections, servicing, parts usage, evidence capture, and work-order execution for assigned jobs.

### Original responsibilities

The Mechanic receives assigned work orders with repair details and priority, starts work, changes the order to IN_PROGRESS, performs the maintenance, records labor hours, attaches parts consumed, adds repair notes, and submits the order for completion. Completion triggers the shared inventory deduction and notifies the Fleet Manager and Superadmin through the organization workflow.

### Expanded responsibilities

| Responsibility area | Required responsibility |
|---|---|
| Assigned queue | View only assigned or otherwise authorized work orders, prioritized by urgency, safety, downtime, promised completion, and parts readiness. |
| Start work | Explicitly start assigned work and move it into execution with a visible state. |
| Execution state | Pause, block, or move work to Waiting for Parts when a reason is required; submit Ready for Review when execution is complete. |
| Repair checklist | Complete inspection, safety, torque, service, and test-drive steps when the applicable checklist/template exists. |
| Labor | Start, pause, resume, and manually correct labor time with a reason; record labor-hour totals for authorized cost visibility. |
| Parts | Review required/reserved/issued/returned/consumed quantities and log authorized parts used against the work order. |
| Repair record | Write repair notes, observations, diagnosis, corrective action, and completion notes. |
| Evidence | Attach before/during/after photos or other evidence, with captions and timestamps where supported. |
| Handoff | Submit the job to Fleet Manager or Supervisor for review, approval, rework, reopening, or final completion. |
| Notifications | Receive assigned-order and status-change notifications and respond to blocked or escalated work. |

### Restrictions

The Mechanic cannot view financial ledgers, vendor pricing, organization billing, unrelated inventory valuation, team governance, or other users’ specialized dashboards. The Mechanic cannot self-approve a high-impact completion where supervisor approval is required.

## 6. Technician

### Core mandate

The Technician is a separate authenticated role with the same fundamental repair-execution boundary as the Mechanic, intended for technical or specialist maintenance work.

### Responsibilities

The Technician receives and executes assigned work orders, starts work, records labor, completes checklists, adds repair notes, uploads evidence, consumes or returns authorized parts, and submits work for Fleet Manager review. The Technician participates in the same Waiting for Parts, Ready for Review, Rework, and completion handoff loop.

The Technician may be assigned work based on the organization’s operational planning and future skill/workload matching. The Technician’s queue is isolated to assigned or authorized work. The Technician cannot access Accountant ledgers, supplier pricing, billing settings, team governance, Driver routes, or unrelated work orders.

### Mechanic–Technician distinction

Mechanics and Technicians share the execution lifecycle but may represent different staffing classifications, specialties, or assignment pools. FleetOps keeps their role identity separate for RBAC, invitation, workspace routing, audit events, and future skill-based dispatch, even where the current execution UI is shared.

## 7. Driver

### Core mandate

The Driver is responsible for safe vehicle operation, daily inspections, field data capture, odometer and fuel reporting, and immediate issue escalation for assigned vehicles.

### Original responsibilities

The Driver completes pre-trip and post-trip DVIR inspections, records safety findings, submits daily odometer readings with optional photo proof, logs fuel fill-ups and receipts, records trip information where available, and flags mechanical or dashboard issues for Fleet Manager review. The Driver sees only the currently assigned vehicle and active trip context.

### Expanded responsibilities

| Responsibility area | Required responsibility |
|---|---|
| Daily home | See assigned vehicle, shift/trip context, outstanding inspection, open defects, fuel status, and urgent instructions immediately. |
| DVIR | Complete configurable pre-trip and post-trip inspection categories and submit results with notes and evidence. |
| Safety disposition | Mark a vehicle Unsafe to Drive when appropriate; capture severity and prevent dispatch until Fleet Manager disposition is recorded. |
| Odometer | Submit current mileage, reject negative or implausible readings, and optionally attach photo proof. |
| Fuel | Record liters, amount in INR, odometer, station, date, and receipt evidence; support validation and duplicate detection when the deeper workflow is enabled. |
| Issue reporting | Report vehicle defects, urgency, description, notes, optional evidence, and immediate safety concerns. |
| Issue timeline | See submitted, acknowledged, assigned, in-progress, resolved, and closed states plus Fleet Manager responses. |
| Handoff acknowledgement | Acknowledge critical instructions or vehicle release status when the organization’s acknowledgement workflow is enabled. |
| Trip/route context | Associate inspection, fuel, odometer, and issue events with trip, route, depot, or shift when dispatch data exists. |
| Offline capture | Maintain local drafts for issue and field entries; full mobile offline sync and conflict resolution remain future scope. |

### Restrictions

The Driver can access only assigned vehicles and authorized field workflows. The Driver cannot view other Drivers’ routes, maintenance schedules, inventory balances, supplier data, financial ledgers, billing, team administration, or enterprise analytics.

## 8. Accountant

### Core mandate

The Accountant owns INR financial record-keeping, cost accounting, reconciliation, profitability analysis, approvals support, and financial reporting.

### Original responsibilities

The Accountant records and categorizes operational revenue such as freight, trips, fares, or contracts and expenses such as fuel, parts, insurance, salaries, maintenance, depreciation, tolls, and other operating costs. The role generates per-vehicle P&L, calculates real-time Cost Per Kilometer, and supports Total Cost of Ownership analysis.

### Expanded responsibilities

| Responsibility area | Required responsibility |
|---|---|
| INR ledger | Add revenue and expense records against organization vehicles with category, date, amount, and approval state. |
| Accounting metadata | Record GST/tax amount, GSTIN, tax category, invoice number, vendor/payee, payment method, withholding/TDS amount, and cost-center metadata where applicable. |
| Cost centers | Attribute costs to vehicle, depot, route, department, project, or other configured cost-center types. |
| Approval workflow | Submit high-value or manual expenses for Superadmin approval; review status and approval reasons. |
| Reconciliation | Match records to invoices, purchase orders, fuel receipts, work orders, or other references; attach a reconciliation reference and timestamp; identify unmatched records. |
| Reversals | Reverse records through immutable compensating entries with reason and audit trail rather than silently overwriting financial history. |
| P&L | Review revenue, expense, profit, per-vehicle performance, and fleet-level totals. |
| CPK/TCO | Review validated distance-based cost per kilometer and cost context for fleet decisions. |
| Filters and views | Filter by vehicle, type, category, date range, and extended vendor/payment/status dimensions as available; preserve clear-filter behavior. |
| Reporting | Export filtered CSV ledgers, filtered PDF statements, vehicle P&L context, maintenance cost context, and CPK reports. |

### Restrictions

The Accountant cannot dispatch work orders, change maintenance configurations, adjust inventory counts outside an authorized financial or reconciliation context, manage Drivers, manage team roles, or alter billing settings. The Accountant’s permissions are transactional and analytical, not operational command authority.

## 9. Cross-functional operational loops

### Issue to triage to execution to reconciliation

The primary FleetOps loop begins when a Driver reports an issue, a DVIR fails, a component reaches a threshold, a document expires, or an inventory condition creates risk. The Fleet Manager acknowledges and triages the signal, determines safety and operational disposition, creates or updates a work order, and assigns a Mechanic or Technician. The executor starts work, completes the checklist, records labor, captures evidence, uses or returns parts, and submits the job for review. The Fleet Manager or Superadmin approves or requests rework. The Inventory Manager reconciles stock movement, and the Accountant records or reconciles the associated financial impact.

| Loop stage | Primary owner | Connected roles | Evidence or handoff |
|---|---|---|---|
| Report | Driver, automation, or inspection | Fleet Manager | Issue, DVIR, odometer, component, document, or stock signal |
| Triage | Fleet Manager | Superadmin, Driver | Acknowledgement, priority, safety disposition, assignment, defer/resolve state |
| Dispatch | Fleet Manager | Mechanic, Technician, Inventory Manager | Work order, assignee, due date, parts readiness, schedule |
| Execute | Mechanic or Technician | Inventory Manager, Fleet Manager | Start, checklist, labor, notes, photos, parts consumption |
| Review | Fleet Manager or Superadmin | Mechanic/Technician | Ready for Review, approval, rework, reopen, or completion reason |
| Reconcile | Inventory Manager and Accountant | Superadmin | Stock movement, receipt/return, invoice, financial record, reconciliation reference |
| Close | Fleet Manager/Superadmin | Driver, organization | Vehicle release, notification, audit event, report/export |

### Vehicle readiness loop

The Fleet Manager owns readiness planning, the Driver supplies field condition and mileage, the Mechanic/Technician executes service, the Inventory Manager supplies parts, and the Accountant measures cost. Superadmin oversight ensures the organization can see risk and approve exceptional actions.

### Purchase-to-repair loop

Low stock creates a reorder signal or draft purchase order. The Inventory Manager reviews and sends the PO, receives partial or final quantities against the PO, records invoice and storage metadata, and makes parts available. The Fleet Manager may then dispatch a work order that reserves or consumes the part. The Mechanic/Technician records actual use or returns, and the Accountant reconciles the supplier invoice and cost allocation.

### Document and compliance loop

The Superadmin and Fleet Manager manage organization, vehicle, and driver documentation. Authorized users upload files through storage-backed procedures, receive secure short-lived access URLs, monitor expiry, renew or replace documents, and review compliance reports. Notifications route expiry or missing-document signals to the responsible role. Retention, checksum, malware-scan policy, access logging, and orphan cleanup are operational safeguards rather than specialist roles.

## 10. Shared workspace and navigation responsibilities

Every workspace must provide a real loading state, empty state, error state, persisted mutation state, and a clear route back to the role’s main workspace. Tables should support consistent row identity, status display, filtering, bulk action feedback, export where authorized, and responsive use on workshop or depot devices.

The public landing page exposes distinct **Sign In** and **Create Organization** paths. New Superadmins create the organization. Invited users receive an organization-bound join path, see their organization and prefilled email, create a password, and enter their assigned role workspace. A user cannot choose a different role during signup.

The organization’s roles are connected through shared records, not through shared unrestricted navigation. For example, a Fleet Manager can see a Mechanic’s work-order handoff, but cannot open the Accountant’s complete ledger. An Accountant can reconcile a work-order-related cost, but cannot dispatch the work order. A Driver can report an issue, but cannot directly assign a Mechanic or mark the repair complete.

## 11. Implemented, partial, deferred, and intentionally excluded scope

The current implementation includes separate role workspaces, organization-bound invitations, server-side RBAC, tenant-scoped procedures, work-order lifecycle controls, vehicle onboarding, maintenance planning signals, driver issue workflows, inventory receipts, PO-linked partial receiving, purchase-order lifecycle controls, mechanic/technician execution, INR ledger entry, GST/TDS-ready fields, reconciliation references, filtered CSV/PDF exports, and expanded Superadmin Quick Find.

Some responsibilities remain deeper or partially implemented rather than absent. These include full saved views, complete detail pages, advanced inventory location and reorder intelligence, configurable inspection templates, full evidence timeline ergonomics, complete notification-channel preferences, CI-level schema/RLS verification, and certain Superadmin lifecycle controls.

The following are intentionally deferred or future scope: Razorpay payment execution, live GPS/telemetry, predictive failure-risk ranking, native mobile offline synchronization, barcode/QR scanning, OCR document extraction, scheduled executive digests, multi-depot comparative dashboards, period close, budgeting and variance, feature flags, performance budgets, and organization archive/export workflows.

## 12. Responsibility principles

FleetOps assigns responsibility according to the operational loop rather than giving every user unrestricted access. **Drivers observe and report. Fleet Managers triage, plan, dispatch, and release. Mechanics and Technicians execute and document. Inventory Managers supply and reconcile physical parts. Accountants record and reconcile money. Superadmins govern, approve, audit, and oversee the organization.**

This division preserves the central product promise: one organization with connected workflows, but seven controlled workspaces with least-privilege access and auditable handoffs.

## References

[1]: /home/ubuntu/upload/pasted_content_VBxjQFkDm8Qn4GYMRmrQbK.txt "Original FleetOps RBAC and Workspace Isolation Matrix supplied during product definition"
[2]: /home/ubuntu/upload/FleetOpsWhole-ProductandWorkspaceImprovementAudit.md "FleetOps Whole-Product and Workspace Improvement Audit"
[3]: /home/ubuntu/fleetops-v2/p0-reconciliation-2026-08-20.md "FleetOps P0 reconciliation evidence"
