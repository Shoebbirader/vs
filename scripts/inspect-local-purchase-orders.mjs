import pg from "pg";
const { Pool } = pg;
const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;
const pool = new Pool({ connectionString, ssl: connectionString?.includes("supabase") ? { rejectUnauthorized: false } : false });
try {
  const result = await pool.query("SELECT current_database() AS database, current_schema() AS schema, column_name, data_type FROM information_schema.columns WHERE table_name = 'purchase_orders' ORDER BY ordinal_position");
  console.log(JSON.stringify({ database: result.rows[0]?.database, schema: result.rows[0]?.schema, columns: result.rows.map(({ column_name, data_type }) => ({ column_name, data_type })) }, null, 2));
} finally { await pool.end(); }
