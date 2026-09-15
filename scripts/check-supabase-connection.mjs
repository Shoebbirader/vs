import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not set");
const url = new URL(connectionString);
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
try {
  const result = await pool.query("select current_database() as database, current_user as user, version() as version");
  console.log(JSON.stringify({ host: url.hostname, port: url.port, database: result.rows[0].database, user: result.rows[0].user, version: result.rows[0].version.split(",")[0] }));
} finally {
  await pool.end();
}
