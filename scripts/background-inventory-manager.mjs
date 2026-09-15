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
const ownerEmail = `fleetops.e2e.inventory-owner.${runId}@example.com`;
const invitedEmail = `fleetops.e2e.inventory-manager.${runId}@example.com`;
const password = `FleetOpsInventoryE2E!${runId}A`;
const results = [];
let ownerId;
let invitedId;
let orgId;
let invitationId;
let inventoryPartId;
let vendorId;
let purchaseOrderId;

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

  const invited = await check("Create temporary Inventory Manager Auth user", async () => {
    const { data, error } = await admin.auth.admin.createUser({ email: invitedEmail, password, email_confirm: true, user_metadata: { fullName: "FleetOps E2E Inventory Manager" } });
    if (error || !data.user) throw error ?? new Error("No invited user returned");
    invitedId = data.user.id;
    return data.user.id;
  });
  const invitation = await check("Create published Inventory Manager invitation", () => tRPC("team.invite", ownerToken, { email: invitedEmail, role: "INVENTORY_MANAGER" }));
  invitationId = invitation.id;
  if (!invitation?.joinUrl || !invitation?.tokenHash) throw new Error("Invitation did not return join URL and token");
  results.push({ name: "Record successful invitation response", status: "PASS", detail: JSON.stringify({ httpStatus: 200, hasToken: Boolean(invitation.tokenHash), hasJoinUrl: Boolean(invitation.joinUrl), delivery: invitation.delivery, serverRelease: invitation.serverRelease ?? "not-reported" }) });
  const details = await check("Resolve organization-bound invitation details", () => tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET"));
  if (details.email !== invitedEmail || details.role !== "INVENTORY_MANAGER" || details.organization.id !== orgId) throw new Error("Invitation details were not organization-bound");
  const invitedToken = await check("Sign in temporary invited user", () => signIn(invitedEmail));
  const joined = await check("Redeem invitation as invited user", () => tRPC("onboarding.acceptInvite", invitedToken, { token: invitation.tokenHash, fullName: "FleetOps E2E Inventory Manager" }));
  if (joined.role !== "INVENTORY_MANAGER" || joined.orgId !== orgId) throw new Error("Redeemed Inventory Manager role or organization mismatch");

  const inventory = await check("Inventory Manager can list inventory", () => tRPC("inventory.list", invitedToken, null, "GET"));
  if (!Array.isArray(inventory)) throw new Error("Inventory list was not returned");
  const part = await check("Inventory Manager can create an inventory part", () => tRPC("inventory.create", invitedToken, { sku: `E2E-${runId}`, name: "E2E Brake Pad", binLocation: "A-01", quantityOnHand: 1, minReorderLevel: 5, unitCost: 1250 }));
  inventoryPartId = part.id;
  const vendor = await check("Load generated auto-reorder vendor", async () => {
    const result = await pool.query(`SELECT id FROM vendors WHERE "orgId" = $1 AND name = $2 ORDER BY "createdAt" DESC LIMIT 1`, [orgId, "FleetOps auto-reorder queue"]);
    if (!result.rows[0]?.id) throw new Error("Auto-reorder vendor was not created");
    vendorId = result.rows[0].id;
    return vendorId;
  });
  await check("Inventory Manager can list purchase orders", () => tRPC("purchaseOrders.list", invitedToken, null, "GET"));
  const purchaseOrder = await check("Inventory Manager can create a purchase order", () => tRPC("purchaseOrders.create", invitedToken, { vendorId: vendor, totalCost: 2500 }));
  purchaseOrderId = purchaseOrder.id;
  await check("Inventory Manager can read notifications", () => tRPC("notifications.list", invitedToken, null, "GET"));

  await check("Inventory Manager cannot access vehicles", async () => {
    try { await tRPC("vehicles.list", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Inventory Manager accessed vehicles");
  });
  await check("Inventory Manager cannot access work orders", async () => {
    try { await tRPC("workOrders.list", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Inventory Manager accessed work orders");
  });
  await check("Inventory Manager cannot access financials", async () => {
    try { await tRPC("financials.list", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Inventory Manager accessed financials");
  });
  await check("Inventory Manager cannot access team members", async () => {
    try { await tRPC("team.members", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Inventory Manager accessed team governance");
  });
  await check("Inventory Manager cannot create invitations", async () => {
    try { await tRPC("team.invite", invitedToken, { email: `blocked.${runId}@example.com`, role: "DRIVER" }); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Inventory Manager created an invitation");
  });
  await check("Inventory Manager cannot access billing", async () => {
    try { await tRPC("billing.status", invitedToken, null, "GET"); } catch (error) { if (String(error).includes("FORBIDDEN")) return "denied as expected"; throw error; }
    throw new Error("Inventory Manager accessed billing");
  });
  await check("Confirm invitation is no longer reusable", async () => {
    try { await tRPC("onboarding.inviteDetails", undefined, { token: invitation.tokenHash }, "GET"); } catch (error) { if (String(error).includes("NOT_FOUND") || String(error).includes("invalid")) return "rejected as expected"; throw error; }
    throw new Error("Redeemed invitation remained reusable");
  });
} finally {
  try {
    if (purchaseOrderId) await pool.query(`DELETE FROM purchase_orders WHERE id = $1`, [purchaseOrderId]);
    if (orgId) {
      await pool.query(`DELETE FROM purchase_orders WHERE "orgId" = $1`, [orgId]);
      if (inventoryPartId) await pool.query(`DELETE FROM inventory_parts WHERE id = $1`, [inventoryPartId]);
      await pool.query(`DELETE FROM notifications WHERE "orgId" = $1`, [orgId]);
      await pool.query(`DELETE FROM vendors WHERE "orgId" = $1`, [orgId]);
    }
    await pool.query(`DELETE FROM invitations WHERE id = $1 OR email IN ($2, $3)`, [invitationId ?? "00000000-0000-0000-0000-000000000000", ownerEmail, invitedEmail]);
    if (orgId) {
      await pool.query(`DELETE FROM users WHERE "orgId" = $1`, [orgId]);
      await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    }
    if (ownerId) await admin.auth.admin.deleteUser(ownerId);
    if (invitedId) await admin.auth.admin.deleteUser(invitedId);
    const invitationCount = await pool.query(`SELECT COUNT(*)::int AS count FROM invitations WHERE email IN ($1, $2)`, [ownerEmail, invitedEmail]);
    const userCount = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE email IN ($1, $2)`, [ownerEmail, invitedEmail]);
    const orgCount = orgId ? await pool.query(`SELECT COUNT(*)::int AS count FROM organizations WHERE id = $1`, [orgId]) : { rows: [{ count: 0 }] };
    const remaining = Number(invitationCount.rows[0].count) + Number(userCount.rows[0].count) + Number(orgCount.rows[0].count);
    if (remaining > 0) throw new Error(`Cleanup verification found ${remaining} temporary rows remaining`);
    results.push({ name: "Verify Inventory Manager temporary data cleanup", status: "PASS", detail: "temporary Auth users, inventory, procurement, notifications, invitations, users, and organization rows removed" });
  } catch (error) {
    results.push({ name: "Verify temporary data cleanup", status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  } finally {
    await pool.end().catch(() => {});
  }
}

console.log(JSON.stringify({ runId, ownerEmail, invitedEmail, results }, null, 2));
if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
