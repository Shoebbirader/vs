import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const columns = await pool.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vehicles' ORDER BY ordinal_position`);
  const constraints = await pool.query(`SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name FROM information_schema.table_constraints tc LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema WHERE tc.table_schema = 'public' AND tc.table_name = 'vehicles' ORDER BY tc.constraint_name`);
  console.log(JSON.stringify({ columns: columns.rows, constraints: constraints.rows }, null, 2));
} finally { await pool.end(); }
