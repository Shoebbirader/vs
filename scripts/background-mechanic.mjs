import { createClient } from "@supabase/supabase-js";
import pg from "pg";
const { Pool } = pg;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const baseUrl = process.env.FLEETOPS_BASE_URL ?? "https://fleetops-elktaacw.manus.space";
if (!supabaseUrl || !serviceKey || !anonKey || !process.env.SUPABASE_DATABASE_URL) throw new Error("Supabase credentials are required");
const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const runId = Date.now().toString(36);
const ownerEmail = `fleetops.e2e.mechanic-owner.${runId}@example.com`;
const invitedEmail = `fleetops.e2e.mechanic.${runId}@example.com`;
const password = `FleetOpsMechanicE2E!${runId}A`;
const results = [];
let ownerId, invitedId, mechanicDbId, orgId, invitationId, vehicleId, workOrderId, partId, componentId;
async function tRPC(path, token, input, method = "POST") { const query = encodeURIComponent(JSON.stringify({ 0: { json: input } })); const url = `${baseUrl}/api/trpc/${path}?batch=1${method === "GET" ? `&input=${query}` : ""}`; const response = await fetch(url, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: method === "GET" ? undefined : JSON.stringify({ 0: { json: input } }) }); const payload = await response.json(); if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 700)}`); if (payload?.[0]?.error) throw new Error(`${path} tRPC error: ${JSON.stringify(payload[0].error).slice(0, 700)}`); return payload?.[0]?.result?.data?.json ?? payload?.[0]?.result?.data; }
async function signIn(email) { const { data, error } = await anon.auth.signInWithPassword({ email, password }); if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "no session"}`); return data.session.access_token; }
async function check(name, fn) { try { const value = await fn(); results.push({ name, status: "PASS", detail: typeof value === "string" ? value : "completed" }); return value; } catch (error) { results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) }); throw error; } }
async function forbidden(name, fn) { return check(name, async () => { try { await fn(); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; } throw new Error("Mechanic accessed a restricted procedure"); }); }
try {
  await check("Create temporary Superadmin Auth user", async () => { const { data, error } = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { fullName: "Mechanic E2E Owner", needsOnboarding: true } }); if (error || !data.user) throw error ?? new Error("No owner returned"); ownerId = data.user.id; });
  const ownerToken = await check("Sign in temporary Superadmin", () => signIn(ownerEmail));
  await check("Bootstrap organization", () => tRPC("onboarding.bootstrap", ownerToken, { orgName: `Mechanic E2E ${runId}`, fullName: "Mechanic E2E Owner" }));
  const summary = await check("Load protected organization summary", () => tRPC("dashboard.summary", ownerToken, null, "GET")); orgId = summary.org.id;
  await check("Complete organization onboarding", () => tRPC("onboarding.complete", ownerToken, { orgName: `Mechanic E2E ${runId}`, fullName: "Mechanic E2E Owner" }));
  const vehicle = await check("Superadmin creates mechanic vehicle", () => tRPC("vehicles.create", ownerToken, { vin: `MECH${runId}VIN`, licensePlate: `MEC-${runId.slice(-6)}`, make: "Tata", model: "Prima", year: 2024, currentOdometer: 1000 })); vehicleId = vehicle.id;
  const part = await check("Superadmin creates service inventory part", () => tRPC("inventory.create", ownerToken, { sku: `MECH-${runId}`, name: "E2E Oil Filter", binLocation: "M-01", quantityOnHand: 3, minReorderLevel: 1, unitCost: 850 })); partId = part.id;
  await check("Create temporary Mechanic Auth user", async () => { const { data, error } = await admin.auth.admin.createUser({ email: invitedEmail, password, email_confirm: true, user_metadata: { fullName: "Mechanic E2E Member" } }); if (error || !data.user) throw error ?? new Error("No mechanic returned"); invitedId = data.user.id; });
  const invitation = await check("Create Mechanic invitation", () => tRPC("team.invite", ownerToken, { email: invitedEmail, role: "MECHANIC" })); invitationId = invitation.id; if (!invitation?.tokenHash || !invitation?.joinUrl) throw new Error("Mechanic invitation missing token or join URL");
  const details = await check("Resolve organization-bound Mechanic invitation", () => tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET")); if (details.email !== invitedEmail || details.role !== "MECHANIC" || details.organization.id !== orgId) throw new Error("Mechanic invitation was not organization-bound");
  const mechanicToken = await check("Sign in invited Mechanic", () => signIn(invitedEmail));
  const joined = await check("Redeem invitation and create Mechanic profile", () => tRPC("onboarding.acceptInvite", mechanicToken, { token: invitation.tokenHash, fullName: "Mechanic E2E Member" })); if (joined.role !== "MECHANIC" || joined.orgId !== orgId) throw new Error("Mechanic role or organization mismatch");
  const dbUser = await pool.query(`SELECT id FROM users WHERE "authUserId" = $1 AND "orgId" = $2`, [invitedId, orgId]); if (!dbUser.rows[0]?.id) throw new Error("Mechanic database profile was not created"); mechanicDbId = dbUser.rows[0].id;
  const order = await check("Superadmin assigns a work order to Mechanic", () => tRPC("workOrders.create", ownerToken, { vehicleId, title: "E2E engine service", description: "Mechanic lifecycle test", priority: "HIGH", assignedMechanicId: mechanicDbId })); workOrderId = order.id;
  const orders = await check("Mechanic lists only assigned work orders", () => tRPC("workOrders.list", mechanicToken, null, "GET")); if (!Array.isArray(orders) || !orders.some((row) => row.id === workOrderId)) throw new Error("Assigned work order was not visible to Mechanic");
  const component = await check("Mechanic can create a vehicle component", () => tRPC("components.create", mechanicToken, { vehicleId, name: "E2E Oil System", expectedLifeKm: 50000, lastServicedOdometer: 1000, alertThresholdKm: 5000 })); componentId = component.id;
  await check("Mechanic can update a vehicle component", () => tRPC("components.update", mechanicToken, { id: componentId, name: "E2E Oil System Updated" }));
  await check("Mechanic can list vehicles", () => tRPC("vehicles.list", mechanicToken, null, "GET"));
  await check("Mechanic can update vehicle odometer", () => tRPC("vehicles.updateOdometer", mechanicToken, { vehicleId, reading: 1100, source: "MECHANIC" }));
  const before = await pool.query(`SELECT "quantityOnHand" FROM inventory_parts WHERE id = $1`, [partId]);
  await check("Mechanic starts assigned work order", () => tRPC("workOrders.startWork", mechanicToken, { workOrderId })); const evidence = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=`;
  await check("Mechanic saves execution checklist", () => tRPC("workOrders.updateChecklist", mechanicToken, { workOrderId, items: [{ id: "safety", title: "Safety isolation and vehicle secured", completed: true }, { id: "diagnosis", title: "Diagnosis and affected component confirmed", completed: true }, { id: "quality", title: "Repair quality and handoff evidence checked", completed: true }] }));
  await check("Mechanic completes assigned work order for review", () => tRPC("workOrders.complete", mechanicToken, { workOrderId, laborHours: 2.5, repairNotes: "Replaced worn belt and verified engine idle.", evidence: [{ fileData: evidence, contentType: "image/png", fileName: "repair-proof.png", caption: "After repair" }], parts: [{ partId, qtyUsed: 1 }] }));
  await check("Superadmin approves reviewed work order", () => tRPC("workOrders.approve", ownerToken, { workOrderId }));
  const after = await pool.query(`SELECT "quantityOnHand" FROM inventory_parts WHERE id = $1`, [partId]); if (Number(after.rows[0].quantityOnHand) !== Number(before.rows[0].quantityOnHand) - 1) throw new Error("Inventory quantity was not decremented by work-order completion");
  const completed = await pool.query(`SELECT status, "startedAt", "laborHours", "repairNotes" FROM work_orders WHERE id = $1`, [workOrderId]); if (completed.rows[0].status !== "COMPLETED" || !completed.rows[0].startedAt || Number(completed.rows[0].laborHours) !== 2.5 || !completed.rows[0].repairNotes) throw new Error("Work-order execution fields were not persisted"); const evidenceRow = await pool.query(`SELECT COUNT(*)::int AS count FROM work_order_evidence WHERE "workOrderId" = $1`, [workOrderId]); if (evidenceRow.rows[0].count !== 1) throw new Error("Work-order evidence was not persisted"); results.push({ name: "Verify approved work order, execution fields, evidence, and inventory consumption", status: "PASS", detail: "status COMPLETED after checklist approval, start/labor/notes/evidence persisted, and one inventory unit consumed" });
  await check("Mechanic can list activity", () => tRPC("activity.recent", mechanicToken, null, "GET"));
  await forbidden("Mechanic cannot access inventory workspace", () => tRPC("inventory.list", mechanicToken, null, "GET"));
  await forbidden("Mechanic cannot access financials", () => tRPC("financials.list", mechanicToken, null, "GET"));
  await forbidden("Mechanic cannot access team governance", () => tRPC("team.members", mechanicToken, null, "GET"));
  await forbidden("Mechanic cannot create invitations", () => tRPC("team.invite", mechanicToken, { email: `blocked.${runId}@example.com`, role: "DRIVER" }));
  await forbidden("Mechanic cannot access billing", () => tRPC("billing.status", mechanicToken, null, "GET"));
  await check("Confirm Mechanic invitation is single-use", async () => { try { await tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET"); } catch (error) { if (String(error).includes("NOT_FOUND") || String(error).includes("invalid")) return "rejected as expected"; throw error; } throw new Error("Redeemed invitation remained reusable"); });
} finally {
  try {
    if (orgId) { if (workOrderId) { await pool.query(`DELETE FROM work_order_evidence WHERE "workOrderId" = $1`, [workOrderId]); await pool.query(`DELETE FROM work_order_parts WHERE "workOrderId" = $1`, [workOrderId]); } await pool.query(`DELETE FROM work_orders WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM components WHERE "vehicleId" IN (SELECT id FROM vehicles WHERE "orgId" = $1)`, [orgId]); await pool.query(`DELETE FROM inventory_parts WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM notifications WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM odometer_logs WHERE "vehicleId" IN (SELECT id FROM vehicles WHERE "orgId" = $1)`, [orgId]); await pool.query(`DELETE FROM vehicles WHERE "orgId" = $1`, [orgId]); }
    await pool.query(`DELETE FROM invitations WHERE id = $1 OR email IN ($2, $3)`, [invitationId ?? "00000000-0000-0000-0000-000000000000", ownerEmail, invitedEmail]);
    if (orgId) { await pool.query(`DELETE FROM users WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]); }
    if (ownerId) await admin.auth.admin.deleteUser(ownerId); if (invitedId) await admin.auth.admin.deleteUser(invitedId);
    const count = await pool.query(`SELECT (SELECT COUNT(*) FROM invitations WHERE email IN ($1,$2)) + (SELECT COUNT(*) FROM users WHERE email IN ($1,$2)) + (SELECT COUNT(*) FROM organizations WHERE id = $3) AS remaining`, [ownerEmail, invitedEmail, orgId ?? "00000000-0000-0000-0000-000000000000"]); if (Number(count.rows[0].remaining) > 0) throw new Error(`Cleanup found ${count.rows[0].remaining} temporary rows`);
    results.push({ name: "Verify Mechanic temporary data cleanup", status: "PASS", detail: "temporary Auth users, work orders, components, inventory, notifications, vehicles, invitations, users, and organization rows removed" });
  } catch (error) { results.push({ name: "Verify Mechanic temporary data cleanup", status: "FAIL", detail: error instanceof Error ? error.message : String(error) }); } finally { await pool.end().catch(() => {}); }
}
console.log(JSON.stringify({ runId, ownerEmail, invitedEmail, results }, null, 2)); if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
