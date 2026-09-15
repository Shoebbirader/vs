import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const columns = await pool.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' ORDER BY ordinal_position`);
  console.log(JSON.stringify(columns.rows, null, 2));
} finally { await pool.end(); }
