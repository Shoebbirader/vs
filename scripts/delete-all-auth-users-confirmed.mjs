import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Pool } = pg;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const users = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
if (users.length !== 13) throw new Error(`Safety stop: expected exactly 13 Auth users, found ${users.length}`);
for (const user of users) {
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Failed deleting Auth user ${user.id}: ${error.message}`);
}
const remaining = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  remaining.push(...data.users);
  if (data.users.length < 1000) break;
}
const appCounts = await pool.query(`
  select
    (select count(*)::int from public.users) as users,
    (select count(*)::int from public.organizations) as organizations,
    (select count(*)::int from public.invitations) as invitations
`);
console.log(JSON.stringify({ deletedCount: users.length, remainingAuthCount: remaining.length, applicationCounts: appCounts.rows[0] }, null, 2));
if (remaining.length !== 0) throw new Error(`Verification failed: ${remaining.length} Auth users remain`);
await pool.end();
