import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const sql = `
create or replace function public.handle_fleetops_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  display_name text;
begin
  display_name := coalesce(new.raw_user_meta_data ->> 'fullName', split_part(new.email, '@', 1));
  insert into public.organizations ("id", "name", "subscriptionTier", "trialEndsAt", "maxVehicles", "maxUsers", "currency", "updatedAt")
  values (gen_random_uuid(), coalesce(new.raw_user_meta_data ->> 'orgName', display_name || '''s Fleet'''), 'TRIAL_FREE', now() + interval '7 days', 3, 5, 'INR', now())
  returning id into new_org_id;
  insert into public.users ("id", "authUserId", "orgId", "email", "fullName", "role", "updatedAt")
  values (gen_random_uuid(), new.id, new_org_id, new.email, display_name, 'SUPERADMIN', now());
  return new;
end;
$$;
`;

await client.connect();
await client.query(sql);
await client.end();
console.log("Auth trigger updated.");
