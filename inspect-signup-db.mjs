import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const columns = await client.query(`select table_name, column_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ('organizations','users') order by table_name, ordinal_position`);
const triggers = await client.query(`select tgname, pg_get_triggerdef(oid) as definition from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal and tgname like '%fleetops%'`);
const functionDef = await client.query(`select pg_get_functiondef('public.handle_fleetops_auth_user()'::regprocedure) as definition`);
const counts = await client.query(`select (select count(*)::int from public.organizations) as organizations, (select count(*)::int from public.users) as users`);
console.log(JSON.stringify({ columns: columns.rows, triggers: triggers.rows, function: functionDef.rows[0]?.definition ?? null, counts: counts.rows[0] }, null, 2));
await client.end();
