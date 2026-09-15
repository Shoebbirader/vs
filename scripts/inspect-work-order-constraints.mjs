import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const columns = await pool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name IN ('status', 'completedAt', 'completed_at')`);
  const constraints = await pool.query(`SELECT c.conname, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid WHERE r.relname = 'work_orders'`);
  const enumType = await pool.query(`SELECT udt_name FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'status'`);
  const labels = await pool.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`, [enumType.rows[0]?.udt_name]);
  console.log(JSON.stringify({ columns: columns.rows, constraints: constraints.rows, enumType: enumType.rows[0]?.udt_name, labels: labels.rows }, null, 2));
} finally { await pool.end(); }
