import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const baseUrl = process.env.FLEETOPS_BASE_URL ?? "https://fleetops-elktaacw.manus.space";
const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = Date.now().toString(36);
const ownerEmail = `fleetops.screenshot.owner.${runId}@example.com`;
const invitedEmail = `fleetops.screenshot.inventory.${runId}@example.com`;
const password = `FleetOpsScreenshot!${runId}A`;
async function trpc(path, token, input, method = "POST") { const query = encodeURIComponent(JSON.stringify({ 0: { json: input } })); const url = `${baseUrl}/api/trpc/${path}?batch=1${method === "GET" ? `&input=${query}` : ""}`; const r = await fetch(url, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: method === "GET" ? undefined : JSON.stringify({ 0: { json: input } }) }); const p = await r.json(); if (!r.ok || p?.[0]?.error) throw new Error(`${path}: ${JSON.stringify(p).slice(0, 700)}`); return p?.[0]?.result?.data?.json ?? p?.[0]?.result?.data; }
async function signIn(email) { const { data, error } = await anon.auth.signInWithPassword({ email, password }); if (error || !data.session) throw error ?? new Error("No session"); return data.session.access_token; }
let ownerId, invitedId, orgId, invitationId;
try {
  const owner = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { fullName: "Screenshot Owner", needsOnboarding: true } }); if (owner.error) throw owner.error; ownerId = owner.data.user.id;
  const ownerToken = await signIn(ownerEmail);
  await trpc("onboarding.bootstrap", ownerToken, { orgName: `Inventory Screenshot ${runId}`, fullName: "Screenshot Owner" });
  const summary = await trpc("dashboard.summary", ownerToken, null, "GET"); orgId = summary.org.id;
  await trpc("onboarding.complete", ownerToken, { orgName: `Inventory Screenshot ${runId}`, fullName: "Screenshot Owner" });
  const invited = await admin.auth.admin.createUser({ email: invitedEmail, password, email_confirm: true, user_metadata: { fullName: "Inventory Screenshot Manager" } }); if (invited.error) throw invited.error; invitedId = invited.data.user.id;
  const invitation = await trpc("team.invite", ownerToken, { email: invitedEmail, role: "INVENTORY_MANAGER" }); invitationId = invitation.id;
  const memberToken = await signIn(invitedEmail);
  await trpc("onboarding.acceptInvite", memberToken, { token: invitation.tokenHash, fullName: "Inventory Screenshot Manager" });
  console.log(JSON.stringify({ runId, ownerEmail, invitedEmail, password, orgId, invitationId }, null, 2));
} catch (error) {
  console.error(error); process.exitCode = 1;
}
