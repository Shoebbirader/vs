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
const ownerEmail = `fleetops.e2e.accountant-owner.${runId}@example.com`;
const invitedEmail = `fleetops.e2e.accountant.${runId}@example.com`;
const password = `FleetOpsAccountantE2E!${runId}A`;
const results = [];
let ownerId, invitedId, orgId, invitationId, vehicleId, financialRecordId;
async function tRPC(path, token, input, method = "POST") { const query = encodeURIComponent(JSON.stringify({ 0: { json: input } })); const url = `${baseUrl}/api/trpc/${path}?batch=1${method === "GET" ? `&input=${query}` : ""}`; const response = await fetch(url, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: method === "GET" ? undefined : JSON.stringify({ 0: { json: input } }) }); const payload = await response.json(); if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 700)}`); if (payload?.[0]?.error) throw new Error(`${path} tRPC error: ${JSON.stringify(payload[0].error).slice(0, 700)}`); return payload?.[0]?.result?.data?.json ?? payload?.[0]?.result?.data; }
async function signIn(email) { const { data, error } = await anon.auth.signInWithPassword({ email, password }); if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "no session"}`); return data.session.access_token; }
async function check(name, fn) { try { const value = await fn(); results.push({ name, status: "PASS", detail: typeof value === "string" ? value : "completed" }); return value; } catch (error) { results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) }); throw error; } }
async function forbidden(name, fn) { return check(name, async () => { try { await fn(); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; } throw new Error("Accountant accessed a restricted procedure"); }); }
try {
  await check("Create temporary Superadmin Auth user", async () => { const { data, error } = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { fullName: "Accountant E2E Owner", needsOnboarding: true } }); if (error || !data.user) throw error ?? new Error("No owner returned"); ownerId = data.user.id; });
  const ownerToken = await check("Sign in temporary Superadmin", () => signIn(ownerEmail));
  await check("Bootstrap organization", () => tRPC("onboarding.bootstrap", ownerToken, { orgName: `Accountant E2E ${runId}`, fullName: "Accountant E2E Owner" }));
  const summary = await check("Load protected organization summary", () => tRPC("dashboard.summary", ownerToken, null, "GET")); orgId = summary.org.id;
  await check("Complete organization onboarding", () => tRPC("onboarding.complete", ownerToken, { orgName: `Accountant E2E ${runId}`, fullName: "Accountant E2E Owner" }));
  const vehicle = await check("Superadmin creates Accountant vehicle", () => tRPC("vehicles.create", ownerToken, { vin: `ACCT${runId}VIN`, licensePlate: `ACC-${runId.slice(-6)}`, make: "Tata", model: "Prima", year: 2024, currentOdometer: 1000 })); vehicleId = vehicle.id;
  await check("Create temporary Accountant Auth user", async () => { const { data, error } = await admin.auth.admin.createUser({ email: invitedEmail, password, email_confirm: true, user_metadata: { fullName: "Accountant E2E Member" } }); if (error || !data.user) throw error ?? new Error("No accountant returned"); invitedId = data.user.id; });
  const invitation = await check("Create Accountant invitation", () => tRPC("team.invite", ownerToken, { email: invitedEmail, role: "ACCOUNTANT" })); invitationId = invitation.id; if (!invitation?.tokenHash || !invitation?.joinUrl) throw new Error("Accountant invitation missing token or join URL");
  const details = await check("Resolve organization-bound Accountant invitation", () => tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET")); if (details.email !== invitedEmail || details.role !== "ACCOUNTANT" || details.organization.id !== orgId) throw new Error("Accountant invitation was not organization-bound");
  const accountantToken = await check("Sign in invited Accountant", () => signIn(invitedEmail));
  const joined = await check("Redeem invitation and create Accountant profile", () => tRPC("onboarding.acceptInvite", accountantToken, { token: invitation.tokenHash, fullName: "Accountant E2E Member" })); if (joined.role !== "ACCOUNTANT" || joined.orgId !== orgId) throw new Error("Accountant role or organization mismatch");
  const recordsBefore = await check("Accountant can list financial records", () => tRPC("financials.list", accountantToken, null, "GET")); if (!Array.isArray(recordsBefore)) throw new Error("Financial record list was not returned");
  const created = await check("Accountant can create an expense record", () => tRPC("financials.create", accountantToken, { vehicleId, type: "EXPENSE", category: "MAINTENANCE", amount: 18500, transactionDate: new Date().toISOString() })); financialRecordId = created.id;
  if (!financialRecordId) throw new Error("Financial record did not return an id");
  const revenue = await check("Accountant can create a revenue record", () => tRPC("financials.create", accountantToken, { vehicleId, type: "REVENUE", category: "CHARTER", amount: 50000, transactionDate: new Date().toISOString() }));
  const recordsAfter = await check("Accountant can list created financial records", async () => { const rows = await tRPC("financials.list", accountantToken, null, "GET"); if (!rows.some((row) => row.id === financialRecordId) || !rows.some((row) => row.id === revenue.id)) throw new Error("Created financial records were not listed"); return "created records listed"; });
  const metrics = await check("Accountant can read financial metrics", () => tRPC("financials.metrics", accountantToken, null, "GET")); if (!metrics?.totals || metrics.totals.expenses < 18500 || metrics.totals.revenue < 50000) throw new Error("Financial metrics did not include created records");
  await check("Accountant can read protected dashboard summary", () => tRPC("dashboard.summary", accountantToken, null, "GET"));
  await forbidden("Accountant cannot access vehicle operations", () => tRPC("vehicles.list", accountantToken, null, "GET"));
  await forbidden("Accountant cannot access work orders", () => tRPC("workOrders.list", accountantToken, null, "GET"));
  await forbidden("Accountant cannot access inventory", () => tRPC("inventory.list", accountantToken, null, "GET"));
  await forbidden("Accountant cannot access team governance", () => tRPC("team.members", accountantToken, null, "GET"));
  await forbidden("Accountant cannot create invitations", () => tRPC("team.invite", accountantToken, { email: `blocked.${runId}@example.com`, role: "DRIVER" }));
  await forbidden("Accountant cannot access billing", () => tRPC("billing.status", accountantToken, null, "GET"));
  await check("Confirm Accountant invitation is single-use", async () => { try { await tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET"); } catch (error) { if (String(error).includes("NOT_FOUND") || String(error).includes("invalid")) return "rejected as expected"; throw error; } throw new Error("Redeemed invitation remained reusable"); });
} finally {
  try {
    if (orgId) { await pool.query(`DELETE FROM financial_records WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM vehicles WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM notifications WHERE "orgId" = $1`, [orgId]); }
    await pool.query(`DELETE FROM invitations WHERE id = $1 OR email IN ($2, $3)`, [invitationId ?? "00000000-0000-0000-0000-000000000000", ownerEmail, invitedEmail]);
    if (orgId) { await pool.query(`DELETE FROM users WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]); }
    if (ownerId) await admin.auth.admin.deleteUser(ownerId); if (invitedId) await admin.auth.admin.deleteUser(invitedId);
    const count = await pool.query(`SELECT (SELECT COUNT(*) FROM invitations WHERE email IN ($1,$2)) + (SELECT COUNT(*) FROM users WHERE email IN ($1,$2)) + (SELECT COUNT(*) FROM organizations WHERE id = $3) AS remaining`, [ownerEmail, invitedEmail, orgId ?? "00000000-0000-0000-0000-000000000000"]); if (Number(count.rows[0].remaining) > 0) throw new Error(`Cleanup found ${count.rows[0].remaining} temporary rows`);
    results.push({ name: "Verify Accountant temporary data cleanup", status: "PASS", detail: "temporary Auth users, financial records, vehicles, notifications, invitations, users, and organization rows removed" });
  } catch (error) { results.push({ name: "Verify Accountant temporary data cleanup", status: "FAIL", detail: error instanceof Error ? error.message : String(error) }); } finally { await pool.end().catch(() => {}); }
}
console.log(JSON.stringify({ runId, ownerEmail, invitedEmail, results }, null, 2)); if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
