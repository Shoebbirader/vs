import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is required");
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const sql = await readFile(new URL("../drizzle/migrations/0001_many_vin_gonzales.sql", import.meta.url), "utf8");
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`${sql}\nALTER TABLE \"vehicle_assignments\" ADD CONSTRAINT \"vehicle_assignments_org_fk\" FOREIGN KEY (\"orgId\") REFERENCES \"organizations\"(\"id\") ON DELETE CASCADE;\nALTER TABLE \"vehicle_assignments\" ADD CONSTRAINT \"vehicle_assignments_vehicle_fk\" FOREIGN KEY (\"vehicleId\") REFERENCES \"vehicles\"(\"id\") ON DELETE CASCADE;\nALTER TABLE \"vehicle_assignments\" ADD CONSTRAINT \"vehicle_assignments_driver_fk\" FOREIGN KEY (\"driverId\") REFERENCES \"users\"(\"id\") ON DELETE CASCADE;\nCREATE INDEX IF NOT EXISTS \"vehicle_assignments_org_driver_active_idx\" ON \"vehicle_assignments\" (\"orgId\", \"driverId\", \"active\");\nCREATE INDEX IF NOT EXISTS \"vehicle_assignments_vehicle_active_idx\" ON \"vehicle_assignments\" (\"vehicleId\", \"active\");`);
  await client.query("COMMIT");
  console.log("vehicle_assignments migration applied");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
