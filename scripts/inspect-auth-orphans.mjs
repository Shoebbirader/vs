import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Pool } = pg;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const authUsers = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  authUsers.push(...data.users);
  if (data.users.length < 1000) break;
}
const appUsers = (await pool.query('select "authUserId", email, "orgId", role from public.users order by email')).rows;
const authIds = new Set(authUsers.map((user) => user.id));
const appAuthIds = new Set(appUsers.map((user) => user.authUserId));
const appEmails = new Set(appUsers.map((user) => String(user.email).toLowerCase()));
const emailCounts = new Map();
for (const user of authUsers) {
  const email = String(user.email ?? "").toLowerCase();
  emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
}
const orphanAuth = authUsers.filter((user) => !appAuthIds.has(user.id));
const orphanApp = appUsers.filter((user) => !authIds.has(user.authUserId));
const duplicateAuthEmails = [...emailCounts.entries()].filter(([, count]) => count > 1).map(([email, count]) => ({ email, count }));
const authSummary = authUsers.map((user) => ({ id: user.id, email: user.email, confirmed: Boolean(user.email_confirmed_at), createdAt: user.created_at, lastSignInAt: user.last_sign_in_at, appUser: appAuthIds.has(user.id), emailInAppTable: appEmails.has(String(user.email ?? "").toLowerCase()) }));
console.log(JSON.stringify({ authCount: authUsers.length, appUserCount: appUsers.length, orphanAuthCount: orphanAuth.length, orphanAppCount: orphanApp.length, duplicateAuthEmails, authSummary, appUsers }, null, 2));
await pool.end();
