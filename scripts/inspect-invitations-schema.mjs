import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const columns = await pool.query("select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name='invitations' order by ordinal_position");
const constraints = await pool.query("select conname, pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='invitations'::regclass");
console.log(JSON.stringify({ columns: columns.rows, constraints: constraints.rows }, null, 2));
await pool.end();
