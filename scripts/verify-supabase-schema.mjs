import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not set");
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
try {
  const tables = await pool.query("select table_name from information_schema.tables where table_schema = 'public' and table_name in ('organizations','users','vehicles','documents','invitations','purchase_order_receipts') order by table_name");
  const columns = await pool.query("select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and ((table_name = 'documents' and column_name in ('archivedAt','archivedById')) or (table_name = 'invitations' and column_name in ('revokedAt','revokedById','resendCount','lastSentAt')) or (table_name = 'purchase_order_receipts' and column_name in ('damagedQuantity','backorderedQuantity','varianceReason'))) order by table_name, column_name");
  const migrationTable = await pool.query("select to_regclass('public.__drizzle_migrations') as migration_table");
  console.log(JSON.stringify({ tables: tables.rows.map((row) => row.table_name), columns: columns.rows, migrationTable: migrationTable.rows[0].migration_table }, null, 2));
} finally {
  await pool.end();
}
