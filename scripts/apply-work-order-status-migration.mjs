import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await pool.query(`ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_PARTS'`);
  await pool.query(`ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW'`);
  await pool.query(`ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'REWORK'`);
  const result = await pool.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'WorkOrderStatus' ORDER BY e.enumsortorder`);
  console.log(JSON.stringify(result.rows, null, 2));
} finally { await pool.end(); }
