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
