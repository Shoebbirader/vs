import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const result = await pool.query("SELECT n.nspname AS schema_name, t.typname AS enum_name, e.enumlabel AS value FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype = 'e' ORDER BY t.typname, e.enumsortorder");
console.log(JSON.stringify(result.rows, null, 2));
await pool.end();
