# VahanSync QA session findings

- Live target: https://fleetops-v2.vercel.app
- Isolated organization created through the public application flow: **VahanSync QA Lab 2026**.
- QA Superadmin account created through the application: `qa.superadmin.vahansync.20260823@example.com`.
- QA password used for the matrix: `VahanQA!2026#`.
- Verified Fleet Manager invitation redemption, account creation, direct redirect to `/fleet-manager`, and role-specific navigation showing Vehicles, Components, Work orders, and Notifications.
- Fleet Manager account: `qa.fleetmanager.vahansync.20260823@example.com`.
- Fleet Manager invitation token: `b18bea1e-5802-4f46-a8be-cacbe3e42db5` (accepted).
- Mechanic invitation: `qa.mechanic.vahansync.20260823@example.com`, token `33d5762a-b19b-4b91-98c1-f0b047c04937` (pending).
- Technician invitation: `qa.technician.vahansync.20260823@example.com`, token `b570c49f-3196-4d2b-8a40-5b814d4beb5e` (pending).
- Driver invitation: `qa.driver.vahansync.20260823@example.com`, token `8412c16b-1fa5-4b59-8cf7-30993e2aede4` (pending).
- Live Team page reports `RESEND_API_KEY` is not configured on Vercel, so the application exposes redeemable join links instead of delivering email.
- Current browser session is the QA Superadmin in Team workspace, ready to create Inventory Manager and Accountant invitations and then redeem pending links one by one.

This file is a QA note only; no production application code was changed during this session.

- Vercel production was redeployed and aliased to https://fleetops-v2.vercel.app; the live Team selector was verified in the browser console to include ACCOUNTANT.
- Accountant invitation: qa.accountant.vahansync.20260823@example.com, token 901c1e59-d6ca-443b-aa28-cc4c98469293 (pending).
- Live Team status now reports 5 pending and 1 accepted invitations.

- Verified Mechanic invitation redemption on Vercel production: qa.mechanic.vahansync.20260823@example.com reached `/mechanic` after password creation.
- Mechanic workspace exposed only Notifications in the sidebar and rendered assigned queue, completed-today, components, alerts, execution record, and service-components sections with organization-scoped context.

- Verified Technician invitation redemption on Vercel production: qa.technician.vahansync.20260823@example.com reached `/mechanic` with the Technician role label.
- Technician workspace rendered the same constrained repair-execution surface with Notifications only, assigned queue, execution record, service components, completed-today, and alerts metrics.

- Verified Driver invitation redemption on Vercel production: qa.driver.vahansync.20260823@example.com reached `/driver`; the portal exposed Notifications, Driver portal, manual odometer, DVIR inspection, issue reporting, fuel logging, and photo-proof fields.
- Verified Inventory Manager invitation redemption on Vercel production: qa.inventory.vahansync.20260823@example.com reached `/inventory`; the workspace exposed Inventory, Vendors, Purchase orders, Notifications, parts catalog, receive/issue/transfer/adjust stock controls, reorder monitor, ledger, purchase-order queue, and stock movements.

- Final Team verification: VahanSync QA Lab 2026 contains 7 organization members total (1 Superadmin plus 6 invited roles) and the invitation ledger reports 0 pending, 6 accepted, 0 expired.
- Workspace evidence captured from Vercel production: Superadmin command center, Fleet Manager, Mechanic, Technician, Driver, Inventory Manager, and Accountant.
- QA session completed through application flows only; no direct database provisioning was used.

- On 2026-08-24, a fresh isolated tenant, **VahanSync Workflow Lab 2026**, was created through the current Vercel production signup and organization-setup routes after the older QA tenant could not be reconciled with the active server database context. The new Superadmin reached the live Command center successfully and its plan panel reports **0 of 10 vehicles included**. This tenant is the safe context for the remaining role workflow verification.
- The fresh tenant has active live-app invitations pending for the Fleet Manager (`workflow-fleetmanager-20260824@vahansync.test`, token `74aa0ec3-de48-4dfc-8ea1-7d6c14e87f2f`) and Mechanic (`workflow-mechanic-20260824@vahansync.test`, token `52667fda-6610-4277-98ad-d37ea1a58248`). Delivery is intentionally manual because the Vercel production environment reports `RESEND_API_KEY` is not configured; no external email delivery was attempted.
- The same real-app Team workflow also created pending Driver (`workflow-driver-20260824@vahansync.test`, token `0983d436-c424-466d-b5a9-46c224ec5fff`), Inventory Manager (`workflow-inventory-20260824@vahansync.test`, token `45a27d0c-7ad2-4717-a937-df2b2428e6d4`), and Accountant (`workflow-accountant-20260824@vahansync.test`, token `806527a4-98d5-452d-ab43-5781df38acca`) invitations. All five accounts remain within the tenant’s 10-user capacity.

- On 2026-08-24, the isolated Workflow Lab tenant’s approved Starter Test Mode activation was confirmed in the live Billing workspace as **Starter / ACTIVE / 3 of 10 vehicles**. The redundant activation control no longer appears; this test-plan activation did not create a charge.
- The authorized live Fleet Manager then created VIN-first vehicles `VSWFLOW2026000004` through `VSWFLOW2026000010`, each with a unique registration/chassis/engine identifier, route, depot, opening odometer, and `CITY_BUS` preventive baseline. The live Fleet register now reports **10 vehicles**. A fully valid eleventh submission was rejected with the expected ten-vehicle entitlement message and did not create a vehicle.
- The current Workflow Lab Mechanic, Driver, and Inventory Manager invitations were redeemed through their own live `/join/` flows. Each account reached its intended role workspace; the Driver is still unassigned, ready for the Fleet Manager assignment check.
- The live Inventory Manager created three on-hand parts through the application: a bus tire (8 units at ₹9,500), front brake pads (12 at ₹4,200), and oil filters (20 at ₹650). The Inventory Manager also created the **Pune Fleet Spares** supplier and a ₹38,000 draft purchase order. The first supplier creation attempt exposed a historical `vendors.updatedAt` schema mismatch; source was aligned to the actual Supabase table, regression-tested, deployed to Vercel, and the retry persisted successfully.
