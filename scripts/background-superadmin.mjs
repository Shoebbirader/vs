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
const ownerEmail = `fleetops.e2e.superadmin.${runId}@example.com`;
const password = `FleetOpsSuperadminE2E!${runId}A`;
const invitedEmails = ["FLEET_MANAGER", "INVENTORY_MANAGER", "MECHANIC", "DRIVER", "ACCOUNTANT"].map((role) => `fleetops.e2e.owner.${role.toLowerCase()}.${runId}@example.com`);
const results = [];
let ownerId, orgId, vehicleId;
const invitationIds = [];
async function tRPC(path, token, input, method = "POST") { const query = encodeURIComponent(JSON.stringify({ 0: { json: input } })); const url = `${baseUrl}/api/trpc/${path}?batch=1${method === "GET" ? `&input=${query}` : ""}`; const response = await fetch(url, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: method === "GET" ? undefined : JSON.stringify({ 0: { json: input } }) }); const payload = await response.json(); if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 700)}`); if (payload?.[0]?.error) throw new Error(`${path} tRPC error: ${JSON.stringify(payload[0].error).slice(0, 700)}`); return payload?.[0]?.result?.data?.json ?? payload?.[0]?.result?.data; }
async function signIn() { const { data, error } = await anon.auth.signInWithPassword({ email: ownerEmail, password }); if (error || !data.session) throw new Error(`Owner sign-in failed: ${error?.message ?? "no session"}`); return data.session.access_token; }
async function check(name, fn) { try { const value = await fn(); results.push({ name, status: "PASS", detail: typeof value === "string" ? value : "completed" }); return value; } catch (error) { results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) }); throw error; } }
try {
  await check("Create temporary Superadmin Auth user", async () => { const { data, error } = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { fullName: "Superadmin E2E Owner", needsOnboarding: true } }); if (error || !data.user) throw error ?? new Error("No owner returned"); ownerId = data.user.id; });
  const token = await signIn(); results.push({ name: "Sign in Superadmin", status: "PASS", detail: "session established" });
  await check("Bootstrap organization", () => tRPC("onboarding.bootstrap", token, { orgName: `Superadmin E2E ${runId}`, fullName: "Superadmin E2E Owner" }));
  const summary = await check("Read organization command summary", () => tRPC("dashboard.summary", token, null, "GET")); orgId = summary.org.id; if (summary.role !== "SUPERADMIN" || summary.needsOnboarding !== true) throw new Error("Owner summary role or onboarding state is incorrect before completion");
  await check("Complete organization onboarding", () => tRPC("onboarding.complete", token, { orgName: `Superadmin E2E ${runId}`, fullName: "Superadmin E2E Owner" }));
  const completedSummary = await check("Verify completed organization onboarding", () => tRPC("dashboard.summary", token, null, "GET")); if (completedSummary.needsOnboarding !== false) throw new Error("Owner onboarding remained incomplete");
  const vehicle = await check("Create fleet vehicle", () => tRPC("vehicles.create", token, { vin: `OWN${runId}VIN`, licensePlate: `OWN-${runId.slice(-6)}`, make: "Tata", model: "Prima", year: 2024, currentOdometer: 2000 })); vehicleId = vehicle.id;
  await check("Create compliance document", () => tRPC("documents.create", token, { title: "Owner E2E RC", docType: "RC", expiryDate: new Date(Date.now() + 365 * 86400000).toISOString(), fileData: "data:application/pdf;base64,SGVsbG8=", fileContentType: "application/pdf", vehicleId }));
  await check("Create INR financial record", () => tRPC("financials.create", token, { vehicleId, type: "EXPENSE", category: "INSURANCE", amount: 12000, transactionDate: new Date().toISOString() }));
  await check("Read owner financial metrics", () => tRPC("financials.metrics", token, null, "GET"));
  await check("Read owner billing status", () => tRPC("billing.status", token, null, "GET"));
  await check("Run organization maintenance evaluation", () => tRPC("automation.evaluate", token, null));
  for (let index = 0; index < invitedEmails.length; index += 1) { const role = ["FLEET_MANAGER", "INVENTORY_MANAGER", "MECHANIC", "DRIVER", "ACCOUNTANT"][index]; const invite = await check(`Invite ${role}`, () => tRPC("team.invite", token, { email: invitedEmails[index], role })); invitationIds.push(invite.id); if (!invite.joinUrl || !invite.tokenHash) throw new Error(`${role} invitation missing join link or token`); const details = await check(`Verify ${role} organization binding`, () => tRPC("onboarding.inviteDetails", undefined, { token: invite.tokenHash }, "GET")); if (details.organization.id !== orgId || details.email !== invitedEmails[index] || details.role !== role) throw new Error(`${role} invitation binding mismatch`); }
  const members = await check("Read organization team directory", () => tRPC("team.members", token, null, "GET")); if (!Array.isArray(members) || !members.some((member) => member.role === "SUPERADMIN")) throw new Error("Owner missing from team directory");
  const invitations = await check("Read invitation governance ledger", () => tRPC("team.invitations", token, null, "GET")); if (invitations.length < invitedEmails.length) throw new Error("Invitation ledger incomplete");
  await check("Read organization notifications", () => tRPC("notifications.list", token, null, "GET"));
} finally {
  try { if (orgId) { await pool.query(`DELETE FROM work_order_parts WHERE "workOrderId" IN (SELECT id FROM work_orders WHERE "orgId" = $1)`, [orgId]); await pool.query(`DELETE FROM work_orders WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM financial_records WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM documents WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM components WHERE "vehicleId" IN (SELECT id FROM vehicles WHERE "orgId" = $1)`, [orgId]); await pool.query(`DELETE FROM inventory_parts WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM notifications WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM vehicles WHERE "orgId" = $1`, [orgId]); }
    if (invitationIds.length) await pool.query(`DELETE FROM invitations WHERE id = ANY($1::uuid[])`, [invitationIds]); else await pool.query(`DELETE FROM invitations WHERE email = $1`, [ownerEmail]);
    if (orgId) { await pool.query(`DELETE FROM users WHERE "orgId" = $1`, [orgId]); await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]); }
    if (ownerId) await admin.auth.admin.deleteUser(ownerId);
    const count = await pool.query(`SELECT (SELECT COUNT(*) FROM invitations WHERE email = ANY($1::text[])) + (SELECT COUNT(*) FROM users WHERE email = $2) + (SELECT COUNT(*) FROM organizations WHERE id = $3) AS remaining`, [invitedEmails, ownerEmail, orgId ?? "00000000-0000-0000-0000-000000000000"]); if (Number(count.rows[0].remaining) > 0) throw new Error(`Cleanup found ${count.rows[0].remaining} temporary rows`); results.push({ name: "Verify Superadmin temporary data cleanup", status: "PASS", detail: "temporary owner, organization, fleet, documents, finance, invitations, and users removed" });
  } catch (error) { results.push({ name: "Verify Superadmin temporary data cleanup", status: "FAIL", detail: error instanceof Error ? error.message : String(error) }); } finally { await pool.end().catch(() => {}); }
}
console.log(JSON.stringify({ runId, ownerEmail, results }, null, 2)); if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
