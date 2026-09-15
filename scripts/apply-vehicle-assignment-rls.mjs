import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query('ALTER TABLE "vehicle_assignments" ENABLE ROW LEVEL SECURITY');
  await client.query('DROP POLICY IF EXISTS "vehicle_assignments_member_read" ON "vehicle_assignments"');
  await client.query('DROP POLICY IF EXISTS "vehicle_assignments_manager_write" ON "vehicle_assignments"');
  await client.query(`CREATE POLICY "vehicle_assignments_member_read" ON "vehicle_assignments" FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM "users" u WHERE u."authUserId" = auth.uid() AND u."orgId" = "vehicle_assignments"."orgId"))`);
  await client.query(`CREATE POLICY "vehicle_assignments_manager_write" ON "vehicle_assignments" FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM "users" u WHERE u."authUserId" = auth.uid() AND u."orgId" = "vehicle_assignments"."orgId" AND u."role" IN ('SUPERADMIN', 'FLEET_MANAGER'))) WITH CHECK (EXISTS (SELECT 1 FROM "users" u WHERE u."authUserId" = auth.uid() AND u."orgId" = "vehicle_assignments"."orgId" AND u."role" IN ('SUPERADMIN', 'FLEET_MANAGER')))`);
  await client.query("COMMIT");
  console.log("vehicle assignment RLS applied");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
