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
const ownerEmail = `fleetops.e2e.driver-owner.${runId}@example.com`;
const invitedEmail = `fleetops.e2e.driver.${runId}@example.com`;
const password = `FleetOpsDriverE2E!${runId}A`;
const results = [];
let ownerId, invitedId, driverDbId, orgId, invitationId, assignedVehicleId, unassignedVehicleId, issueId;
async function tRPC(path, token, input, method = "POST") {
  const query = encodeURIComponent(JSON.stringify({ 0: { json: input } }));
  const url = `${baseUrl}/api/trpc/${path}?batch=1${method === "GET" ? `&input=${query}` : ""}`;
  const response = await fetch(url, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: method === "GET" ? undefined : JSON.stringify({ 0: { json: input } }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 700)}`);
  if (payload?.[0]?.error) throw new Error(`${path} tRPC error: ${JSON.stringify(payload[0].error).slice(0, 700)}`);
  return payload?.[0]?.result?.data?.json ?? payload?.[0]?.result?.data;
}
async function signIn(email) { const { data, error } = await anon.auth.signInWithPassword({ email, password }); if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "no session"}`); return data.session.access_token; }
async function check(name, fn) { try { const value = await fn(); results.push({ name, status: "PASS", detail: typeof value === "string" ? value : "completed" }); return value; } catch (error) { results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) }); throw error; } }
async function forbidden(name, fn) { return check(name, async () => { try { await fn(); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; } throw new Error("Driver accessed a restricted procedure"); }); }
try {
  await check("Create temporary Superadmin Auth user", async () => { const { data, error } = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { fullName: "Driver E2E Owner", needsOnboarding: true } }); if (error || !data.user) throw error ?? new Error("No owner returned"); ownerId = data.user.id; });
  const ownerToken = await check("Sign in temporary Superadmin", () => signIn(ownerEmail));
  await check("Bootstrap organization", () => tRPC("onboarding.bootstrap", ownerToken, { orgName: `Driver E2E ${runId}`, fullName: "Driver E2E Owner" }));
  const summary = await check("Load protected organization summary", () => tRPC("dashboard.summary", ownerToken, null, "GET")); orgId = summary.org.id;
  await check("Complete organization onboarding", () => tRPC("onboarding.complete", ownerToken, { orgName: `Driver E2E ${runId}`, fullName: "Driver E2E Owner" }));
  const firstVehicle = await check("Superadmin creates assigned vehicle", () => tRPC("vehicles.create", ownerToken, { vin: `DRIVER${runId}A`, licensePlate: `DRV-A-${runId.slice(-5)}`, make: "Tata", model: "Prima", year: 2024, currentOdometer: 1000 })); assignedVehicleId = firstVehicle.id;
  const secondVehicle = await check("Superadmin creates unassigned vehicle", () => tRPC("vehicles.create", ownerToken, { vin: `DRIVER${runId}B`, licensePlate: `DRV-B-${runId.slice(-5)}`, make: "Ashok Leyland", model: "Viking", year: 2023, currentOdometer: 500 })); unassignedVehicleId = secondVehicle.id;
  await check("Create temporary Driver Auth user", async () => { const { data, error } = await admin.auth.admin.createUser({ email: invitedEmail, password, email_confirm: true, user_metadata: { fullName: "Driver E2E Member" } }); if (error || !data.user) throw error ?? new Error("No driver returned"); invitedId = data.user.id; });
  const invitation = await check("Create Driver invitation", () => tRPC("team.invite", ownerToken, { email: invitedEmail, role: "DRIVER" })); invitationId = invitation.id; if (!invitation?.tokenHash || !invitation?.joinUrl) throw new Error("Driver invitation missing token or join URL");
  const details = await check("Resolve organization-bound Driver invitation", () => tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET")); if (details.email !== invitedEmail || details.role !== "DRIVER" || details.organization.id !== orgId) throw new Error("Driver invitation was not organization-bound");
  const invitedToken = await check("Sign in invited Driver", () => signIn(invitedEmail));
  const joined = await check("Redeem invitation and create Driver profile", () => tRPC("onboarding.acceptInvite", invitedToken, { token: invitation.tokenHash, fullName: "Driver E2E Member" })); if (joined.role !== "DRIVER" || joined.orgId !== orgId) throw new Error("Driver role or organization mismatch");
  const dbUser = await pool.query(`SELECT id FROM users WHERE "authUserId" = $1 AND "orgId" = $2`, [invitedId, orgId]); if (!dbUser.rows[0]?.id) throw new Error("Driver database profile was not created"); driverDbId = dbUser.rows[0].id;
  await check("Superadmin assigns the Driver one vehicle", () => tRPC("team.assignVehicle", ownerToken, { driverId: driverDbId, vehicleId: assignedVehicleId, active: true }));
  const vehicles = await check("Driver lists only assigned vehicles", () => tRPC("vehicles.list", invitedToken, null, "GET")); if (!Array.isArray(vehicles) || vehicles.length !== 1 || vehicles[0].id !== assignedVehicleId) throw new Error("Driver vehicle isolation failed");
  await check("Driver can list inspections", () => tRPC("driver.inspections", invitedToken, null, "GET"));
  await check("Driver can create a pre-trip inspection", () => tRPC("driver.createInspection", invitedToken, { vehicleId: assignedVehicleId, inspectionType: "PRE_TRIP", status: "PASS", notes: "All safety checks passed" }));
  await check("Driver can list fuel logs", () => tRPC("driver.fuelLogs", invitedToken, null, "GET"));
  await check("Driver can create a fuel log", () => tRPC("driver.createFuelLog", invitedToken, { vehicleId: assignedVehicleId, liters: 40, amount: 4200, odometer: 1100, station: "E2E IndianOil" }));
  const issue = await check("Driver reports an assigned vehicle issue", () => tRPC("vehicleIssues.create", invitedToken, { vehicleId: assignedVehicleId, title: "E2E brake warning", description: "Brake warning light appeared during route inspection.", priority: "HIGH" })); issueId = issue.id;
  const driverIssues = await check("Driver lists own vehicle issues", () => tRPC("vehicleIssues.list", invitedToken, null, "GET")); if (!driverIssues.some((row) => row.id === issueId && row.driverId === driverDbId)) throw new Error("Driver issue was not visible in driver scope");
  const managerIssues = await check("Superadmin sees Driver vehicle issue", () => tRPC("vehicleIssues.list", ownerToken, null, "GET")); if (!managerIssues.some((row) => row.id === issueId && row.orgId === orgId)) throw new Error("Fleet issue was not visible to organization management");
  await check("Superadmin triages Driver vehicle issue", () => tRPC("vehicleIssues.updateStatus", ownerToken, { issueId, status: "ACKNOWLEDGED" }));
  await check("Driver can update assigned vehicle odometer", () => tRPC("vehicles.updateOdometer", invitedToken, { vehicleId: assignedVehicleId, reading: 1200, source: "MANUAL_DRIVER" }));
  await forbidden("Driver cannot update an unassigned vehicle", () => tRPC("vehicles.updateOdometer", invitedToken, { vehicleId: unassignedVehicleId, reading: 600, source: "MANUAL_DRIVER" }));
  await forbidden("Driver cannot create an inspection on an unassigned vehicle", () => tRPC("driver.createInspection", invitedToken, { vehicleId: unassignedVehicleId, inspectionType: "PRE_TRIP", status: "PASS" }));
  await forbidden("Driver cannot report an issue on an unassigned vehicle", () => tRPC("vehicleIssues.create", invitedToken, { vehicleId: unassignedVehicleId, title: "Blocked issue", description: "This must be rejected by assignment scope.", priority: "HIGH" }));
  await forbidden("Driver cannot triage vehicle issues", () => tRPC("vehicleIssues.updateStatus", invitedToken, { issueId, status: "RESOLVED" }));
  await forbidden("Driver cannot access work orders", () => tRPC("workOrders.list", invitedToken, null, "GET"));
  await forbidden("Driver cannot access inventory", () => tRPC("inventory.list", invitedToken, null, "GET"));
  await forbidden("Driver cannot access financials", () => tRPC("financials.list", invitedToken, null, "GET"));
  await forbidden("Driver cannot access team governance", () => tRPC("team.members", invitedToken, null, "GET"));
  await forbidden("Driver cannot create invitations", () => tRPC("team.invite", invitedToken, { email: `blocked.${runId}@example.com`, role: "MECHANIC" }));
  await forbidden("Driver cannot access billing", () => tRPC("billing.status", invitedToken, null, "GET"));
  await check("Confirm Driver invitation is single-use", async () => { try { await tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET"); } catch (error) { if (String(error).includes("NOT_FOUND") || String(error).includes("invalid")) return "rejected as expected"; throw error; } throw new Error("Redeemed invitation remained reusable"); });
} finally {
  try {
    if (orgId) { await pool.query(`DELETE FROM vehicle_issues WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM fuel_logs WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM dvir_inspections WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM odometer_logs WHERE "vehicleId" IN (SELECT id FROM vehicles WHERE "orgId" = $1)`, [orgId]); await pool.query(`DELETE FROM vehicle_assignments WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM financial_records WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM vehicles WHERE "orgId" = $1`, [orgId]); }
    await pool.query(`DELETE FROM invitations WHERE id = $1 OR email IN ($2, $3)`, [invitationId ?? "00000000-0000-0000-0000-000000000000", ownerEmail, invitedEmail]);
    if (orgId) { await pool.query(`DELETE FROM users WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]); }
    if (ownerId) await admin.auth.admin.deleteUser(ownerId); if (invitedId) await admin.auth.admin.deleteUser(invitedId);
    const count = await pool.query(`SELECT (SELECT COUNT(*) FROM invitations WHERE email IN ($1,$2)) + (SELECT COUNT(*) FROM users WHERE email IN ($1,$2)) + (SELECT COUNT(*) FROM organizations WHERE id = $3) AS remaining`, [ownerEmail, invitedEmail, orgId ?? "00000000-0000-0000-0000-000000000000"]); if (Number(count.rows[0].remaining) > 0) throw new Error(`Cleanup found ${count.rows[0].remaining} temporary rows`);
    results.push({ name: "Verify Driver temporary data cleanup", status: "PASS", detail: "temporary Auth users, vehicles, assignments, inspections, fuel logs, odometers, financial records, invitations, users, and organization rows removed" });
  } catch (error) { results.push({ name: "Verify Driver temporary data cleanup", status: "FAIL", detail: error instanceof Error ? error.message : String(error) }); } finally { await pool.end().catch(() => {}); }
}
console.log(JSON.stringify({ runId, ownerEmail, invitedEmail, results }, null, 2)); if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
