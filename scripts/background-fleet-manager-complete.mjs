import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Pool } = pg;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const baseUrl = process.env.FLEETOPS_BASE_URL ?? "https://fleetops-elktaacw.manus.space";
if (!supabaseUrl || !serviceKey || !anonKey) throw new Error("Supabase server and browser keys are required");

const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const runId = Date.now().toString(36);
const ownerEmail = `fleetops.e2e.owner.${runId}@example.com`;
const invitedEmail = `fleetops.e2e.fleet-manager.${runId}@example.com`;
const mechanicEmail = `fleetops.e2e.mechanic.${runId}@example.com`;
const password = `FleetOpsE2E!${runId}A`;
const results = [];
let ownerId;
let invitedId;
let mechanicId;
let mechanicToken;
let orgId;
let invitationId;
let mechanicInvitationId;
let vehicleId;
let workOrderId;
let documentId;

async function tRPC(path, token, input, method = "POST") {
  const query = encodeURIComponent(JSON.stringify({ 0: { json: input } }));
  const url = `${baseUrl}/api/trpc/${path}?batch=1${method === "GET" ? `&input=${query}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === "GET" ? undefined : JSON.stringify({ 0: { json: input } }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 600)}`);
  const value = payload?.[0]?.result?.data?.json ?? payload?.[0]?.result?.data;
  if (payload?.[0]?.error) throw new Error(`${path} tRPC error: ${JSON.stringify(payload[0].error).slice(0, 600)}`);
  return value;
}

async function signIn(email) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "no session"}`);
  return data.session.access_token;
}

async function check(name, fn) {
  try {
    const value = await fn();
    results.push({ name, status: "PASS", detail: typeof value === "string" && value.length > 80 ? "credential obtained" : typeof value === "string" ? value : "completed" });
    return value;
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

try {
  const owner = await check("Create temporary Superadmin Auth user", async () => {
    const { data, error } = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { fullName: "FleetOps E2E Owner", needsOnboarding: true } });
    if (error || !data.user) throw error ?? new Error("No owner user returned");
    ownerId = data.user.id;
    return data.user.id;
  });
  const ownerToken = await check("Sign in temporary Superadmin", () => signIn(ownerEmail));
  const ownerContext = await check("Bootstrap or load organization", () => tRPC("onboarding.bootstrap", ownerToken, { orgName: `FleetOps E2E ${runId}`, fullName: "FleetOps E2E Owner" }));
  orgId = ownerContext.id ? ownerContext.orgId : undefined;
  const summary = await check("Load protected dashboard summary", () => tRPC("dashboard.summary", ownerToken, null, "GET"));
  if (!summary?.org?.id) throw new Error("Dashboard summary did not return an organization");
  orgId = summary.org.id;
  await check("Complete organization onboarding", () => tRPC("onboarding.complete", ownerToken, { orgName: `FleetOps E2E ${runId}`, fullName: "FleetOps E2E Owner" }));

  const invited = await check("Create temporary Fleet Manager Auth user", async () => {
    const { data, error } = await admin.auth.admin.createUser({ email: invitedEmail, password, email_confirm: true, user_metadata: { fullName: "FleetOps E2E Fleet Manager" } });
    if (error || !data.user) throw error ?? new Error("No invited user returned");
    invitedId = data.user.id;
    return data.user.id;
  });
  const invitation = await check("Create published Team invitation", () => tRPC("team.invite", ownerToken, { email: invitedEmail, role: "FLEET_MANAGER" }));
  invitationId = invitation.id;
  if (!invitation?.joinUrl || !invitation?.tokenHash) throw new Error("Invitation did not return join URL and token");
  results.push({ name: "Record successful invitation response", status: "PASS", detail: JSON.stringify({ httpStatus: 200, hasToken: Boolean(invitation.tokenHash), hasJoinUrl: Boolean(invitation.joinUrl), delivery: invitation.delivery, serverRelease: invitation.serverRelease ?? "not-reported" }) });
  const details = await check("Resolve organization-bound invitation details", () => tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET"));
  if (details.email !== invitedEmail || details.role !== "FLEET_MANAGER" || details.organization.id !== orgId) throw new Error("Invitation details were not organization-bound");
  const invitedToken = await check("Sign in temporary invited user", () => signIn(invitedEmail));
  const joined = await check("Redeem invitation as invited user", () => tRPC("onboarding.acceptInvite", invitedToken, { token: invitation.tokenHash, fullName: "FleetOps E2E Fleet Manager" }));
  if (joined.role !== "FLEET_MANAGER" || joined.orgId !== orgId) throw new Error("Redeemed Fleet Manager role or organization mismatch");
  const mechanic = await check("Create temporary Mechanic Auth user", async () => { const { data, error } = await admin.auth.admin.createUser({ email: mechanicEmail, password, email_confirm: true, user_metadata: { fullName: "FleetOps E2E Mechanic" } }); if (error || !data.user) throw error ?? new Error("No mechanic user returned"); mechanicId = data.user.id; return data.user.id; });
  const mechanicInvite = await check("Create Mechanic invitation for handoff", () => tRPC("team.invite", ownerToken, { email: mechanicEmail, role: "MECHANIC" }));
  mechanicInvitationId = mechanicInvite.id;
  const mechanicDetails = await check("Resolve Mechanic invitation organization binding", () => tRPC("onboarding.inviteDetails", undefined, { token: mechanicInvite.tokenHash }, "GET"));
  if (mechanicDetails.organization.id !== orgId || mechanicDetails.role !== "MECHANIC") throw new Error("Mechanic invitation binding mismatch");
  mechanicToken = await check("Sign in temporary Mechanic", () => signIn(mechanicEmail));
  const mechanicJoined = await check("Redeem Mechanic invitation", () => tRPC("onboarding.acceptInvite", mechanicToken, { token: mechanicInvite.tokenHash, fullName: "FleetOps E2E Mechanic" }));
  if (mechanicJoined.role !== "MECHANIC" || mechanicJoined.orgId !== orgId) throw new Error("Redeemed Mechanic role or organization mismatch");
  const directory = await check("Resolve Mechanic application member identity", () => tRPC("team.members", ownerToken, null, "GET"));
  const mechanicMember = directory.find((member) => member.email === mechanicEmail && member.role === "MECHANIC");
  if (!mechanicMember?.id) throw new Error("Mechanic application member was not present in the organization directory");
  mechanicId = mechanicMember.id;

  const vehicles = await check("Fleet Manager can list vehicles", () => tRPC("vehicles.list", invitedToken, null, "GET"));
  if (!Array.isArray(vehicles)) throw new Error("Vehicle list was not returned");
  const vehicle = await check("Fleet Manager can create a vehicle", () => tRPC("vehicles.create", invitedToken, { vin: `E2E${runId}VIN`, licensePlate: `E2E-${runId.slice(-5)}`, make: "Tata", model: "Prima", year: 2024, currentOdometer: 1000 }));
  vehicleId = vehicle.id;
  const component = await check("Fleet Manager can create a component", () => tRPC("components.create", invitedToken, { vehicleId, name: "E2E Engine", expectedLifeKm: 100000, lastServicedOdometer: 1000, alertThresholdKm: 5000 }));
  await check("Fleet Manager can update a component", () => tRPC("components.update", invitedToken, { id: component.id, name: "E2E Engine Updated" }));
  const workOrder = await check("Fleet Manager can create a work order", () => tRPC("workOrders.create", invitedToken, { vehicleId, title: "E2E preventive service", description: "Fleet Manager lifecycle test", priority: "MEDIUM" }));
  workOrderId = workOrder.id;
  await check("Fleet Manager can list work orders", () => tRPC("workOrders.list", invitedToken, null, "GET"));
  await check("Fleet Manager can apply bulk priority", () => tRPC("workOrders.bulkUpdate", invitedToken, { workOrderIds: [workOrderId], priority: "HIGH" }));
  await check("Fleet Manager can assign a Mechanic", () => tRPC("workOrders.bulkUpdate", invitedToken, { workOrderIds: [workOrderId], assignedMechanicId: mechanicId }));
  await check("Fleet Manager can schedule a work order", () => tRPC("workOrders.bulkUpdate", invitedToken, { workOrderIds: [workOrderId], scheduledFor: new Date(Date.now() + 2 * 86400000) }));
  await check("Fleet Manager can archive a work order", () => tRPC("workOrders.bulkUpdate", invitedToken, { workOrderIds: [workOrderId], archive: true }));
  await check("Fleet Manager can unarchive a work order", () => tRPC("workOrders.bulkUpdate", invitedToken, { workOrderIds: [workOrderId], archive: false }));
  await check("Fleet Manager can cancel an eligible work order", () => tRPC("workOrders.bulkUpdate", invitedToken, { workOrderIds: [workOrderId], cancel: true }));
  await check("Fleet Manager can read maintenance planning signals", () => tRPC("planning.maintenance", invitedToken, { from: new Date(), to: new Date(Date.now() + 180 * 86400000) }, "GET"));
  await check("Fleet Manager can read driver handoff visibility", () => tRPC("team.driverHandoffs", invitedToken, null, "GET"));
  await check("Fleet Manager can list compliance documents", () => tRPC("documents.list", invitedToken, null, "GET"));
  const document = await check("Fleet Manager can create a compliance document", () => tRPC("documents.create", invitedToken, { title: `E2E Fitness ${runId}`, docType: "FITNESS", fileUrl: "https://example.com/fleetops-e2e.pdf", expiryDate: new Date(Date.now() + 30 * 86400000).toISOString(), vehicleId }));
  documentId = document.id;
  await check("Fleet Manager can update a compliance document", () => tRPC("documents.update", invitedToken, { id: documentId, title: `E2E Fitness Updated ${runId}` }));
  await check("Fleet Manager can export compliance CSV", () => tRPC("documents.exportCsv", invitedToken, null, "GET"));
  await check("Fleet Manager can export compliance PDF", () => tRPC("documents.exportPdf", invitedToken, null, "GET"));

  await check("Fleet Manager cannot access Superadmin team members", async () => {
    try { await tRPC("team.members", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Fleet Manager accessed team governance");
  });
  await check("Fleet Manager cannot create invitations", async () => {
    try { await tRPC("team.invite", invitedToken, { email: `blocked.${runId}@example.com`, role: "DRIVER" }); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Fleet Manager created an invitation");
  });
  await check("Fleet Manager cannot access financials", async () => {
    try { await tRPC("financials.list", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Fleet Manager accessed financials");
  });
  await check("Fleet Manager cannot access inventory", async () => {
    try { await tRPC("inventory.list", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Fleet Manager accessed inventory");
  });
  await check("Fleet Manager cannot access purchase orders", async () => {
    try { await tRPC("purchaseOrders.list", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Fleet Manager accessed purchase orders");
  });
  await check("Fleet Manager cannot access billing", async () => {
    try { await tRPC("billing.status", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Fleet Manager accessed billing");
  });
  await check("Confirm invitation is no longer reusable", async () => {
    try { await tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET"); } catch (error) { if (String(error).includes("NOT_FOUND") || String(error).includes("invalid")) return "rejected as expected"; throw error; }
    throw new Error("Redeemed invitation remained reusable");
  });
} finally {
  try {
    if (documentId) await pool.query(`DELETE FROM documents WHERE id = $1`, [documentId]);
    if (workOrderId) await pool.query(`DELETE FROM work_orders WHERE id = $1`, [workOrderId]);
    if (vehicleId) { await pool.query(`DELETE FROM components WHERE "vehicleId" = $1`, [vehicleId]); await pool.query(`DELETE FROM vehicles WHERE id = $1`, [vehicleId]); }
    await pool.query(`DELETE FROM invitations WHERE id = $1 OR id = $2 OR email IN ($3, $4, $5)`, [invitationId ?? "00000000-0000-0000-0000-000000000000", mechanicInvitationId ?? "00000000-0000-0000-0000-000000000000", ownerEmail, invitedEmail, mechanicEmail]);
    if (orgId) {
      await pool.query(`DELETE FROM users WHERE "orgId" = $1`, [orgId]);
      await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    }
    if (ownerId) await admin.auth.admin.deleteUser(ownerId);
    if (invitedId) await admin.auth.admin.deleteUser(invitedId);
    if (mechanicId) await admin.auth.admin.deleteUser(mechanicId);
    const invitationCount = await pool.query(`SELECT COUNT(*)::int AS count FROM invitations WHERE email IN ($1, $2, $3)`, [ownerEmail, invitedEmail, mechanicEmail]);
    const userCount = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE email IN ($1, $2, $3)`, [ownerEmail, invitedEmail, mechanicEmail]);
    const orgCount = orgId ? await pool.query(`SELECT COUNT(*)::int AS count FROM organizations WHERE id = $1`, [orgId]) : { rows: [{ count: 0 }] };
    const remaining = Number(invitationCount.rows[0].count) + Number(userCount.rows[0].count) + Number(orgCount.rows[0].count);
    if (remaining > 0) throw new Error(`Cleanup verification found ${remaining} temporary rows remaining`);
    results.push({ name: "Verify temporary data cleanup", status: "PASS", detail: "temporary Auth users, invitations, users, and organization rows removed" });
  } catch (error) {
    results.push({ name: "Verify temporary data cleanup", status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  } finally {
    await pool.end().catch(() => {});
  }
}

console.log(JSON.stringify({ runId, ownerEmail, invitedEmail, results }, null, 2));
if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
