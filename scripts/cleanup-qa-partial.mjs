import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const client = await pool.connect();
try {
  const users = await client.query(`SELECT "authUserId", email FROM users WHERE email LIKE 'qa.%@example.com' OR "fullName" LIKE '% QA %'`);
  const authIds = users.rows.map((row) => row.authUserId);
  await client.query("BEGIN");
  await client.query(`DELETE FROM organizations WHERE name LIKE 'VahanSync QA Lab %' OR name LIKE '%''s Fleet'`);
  await client.query("COMMIT");
  for (const authUserId of authIds) {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users/${authUserId}`, { method: "DELETE", headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
    if (!response.ok && response.status !== 404) throw new Error(`Auth delete ${authUserId}: ${response.status} ${await response.text()}`);
  }
  console.log(JSON.stringify({ deletedAuthUsers: authIds.length, deletedProfilePattern: true }, null, 2));
} finally {
  client.release();
  await pool.end();
}
