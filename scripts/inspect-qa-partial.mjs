import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const result = await pool.query(`SELECT u.id, u."authUserId", u."orgId", u.email, u."fullName", u.role, u."createdAt", o.name AS organization_name FROM users u LEFT JOIN organizations o ON o.id = u."orgId" WHERE u.email LIKE 'qa.%@example.com' OR o.name LIKE 'VahanSync QA Lab %' ORDER BY u."createdAt" DESC LIMIT 20`);
console.log(JSON.stringify(result.rows, null, 2));
await pool.end();
