import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Client } = pg;
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const email = `fleetops-trigger-check-${Date.now()}@example.invalid`;
const password = `FleetOpsCheck-${crypto.randomUUID()}!`;
let authUserId;
let orgId;
let connected = false;

try {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { fullName: "FleetOps Trigger Check", needsOnboarding: true } });
  if (error || !data.user) throw error ?? new Error("Auth user was not created");
  authUserId = data.user.id;
  await client.connect();
  connected = true;
  const result = await client.query(`select u."orgId", o."subscriptionTier", o."currency", u."role", u."updatedAt" as user_updated, o."updatedAt" as org_updated from public.users u join public.organizations o on o.id = u."orgId" where u."authUserId" = $1`, [authUserId]);
  if (result.rowCount !== 1) throw new Error(`Expected one provisioned FleetOps user, found ${result.rowCount}`);
  const row = result.rows[0];
  orgId = row.orgId;
  if (row.subscriptionTier !== "TRIAL_FREE" || row.currency !== "INR" || row.role !== "SUPERADMIN" || !row.user_updated || !row.org_updated) throw new Error("Provisioned rows did not contain expected trial, currency, role, or audit values");
  console.log("Supabase Auth provisioning integration check passed.");
} finally {
  if (!connected) await client.connect().then(() => { connected = true; }).catch(() => undefined);
  if (connected) {
    if (authUserId) await client.query(`delete from public.users where "authUserId" = $1`, [authUserId]);
    if (orgId) await client.query(`delete from public.organizations where id = $1`, [orgId]);
    await client.end();
  }
  if (authUserId) await supabaseAdmin.auth.admin.deleteUser(authUserId, true);
}
