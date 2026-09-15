import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const result = await pool.query(`
  select table_name, column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('purchase_orders', 'purchase_order_receipts')
  order by table_name, ordinal_position
`);
const enumResult = await pool.query(`
  select t.typname as type_name, e.enumlabel as enum_label
  from pg_type t
  join pg_enum e on t.oid = e.enumtypid
  where t.typname ilike '%purchase%status%' or t.typname ilike '%status%'
  order by t.typname, e.enumsortorder
`);
console.log(JSON.stringify({ columns: result.rows, enums: enumResult.rows }, null, 2));
await pool.end();
