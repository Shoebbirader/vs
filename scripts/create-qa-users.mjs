import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!supabaseUrl || !serviceRoleKey || !databaseUrl) throw new Error("Supabase admin and database environment variables are required");

const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
const password = `VahanQA!${runId}`;
const organizationName = `VahanSync QA Lab ${runId}`;
const roles = [
  ["SUPERADMIN", "Aarav QA Superadmin", "superadmin"],
  ["FLEET_MANAGER", "Meera QA Fleet Manager", "fleet-manager"],
  ["MECHANIC", "Kabir QA Mechanic", "mechanic"],
  ["TECHNICIAN", "Tara QA Technician", "technician"],
  ["INVENTORY_MANAGER", "Ishaan QA Inventory Manager", "inventory-manager"],
  ["DRIVER", "Riya QA Driver", "driver"],
  ["ACCOUNTANT", "Neel QA Accountant", "accountant"],
];
const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
const created = [];

async function createAuthUser(email, fullName) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Auth user ${email}: ${response.status} ${JSON.stringify(payload)}`);
  return payload.id;
}

async function waitForProfile(client, authUserId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await client.query(`SELECT id, "orgId" FROM users WHERE "authUserId" = $1`, [authUserId]);
    if (result.rows[0]) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No VahanSync profile was created for Auth user ${authUserId}`);
}

try {
  const client = await pool.connect();
  try {
    const first = roles[0];
    const firstEmail = `qa.${first[2]}.${runId}@example.com`;
    const firstAuthUserId = await createAuthUser(firstEmail, first[1]);
    const firstProfile = await waitForProfile(client, firstAuthUserId);
    const organizationId = firstProfile.orgId;

    await client.query("BEGIN");
    await client.query(`UPDATE organizations SET name = $1, "subscriptionTier" = 'TRIAL_FREE', "trialEndsAt" = NOW() + INTERVAL '30 days', "maxVehicles" = 25, "maxUsers" = 20, currency = 'INR', "billingStatus" = 'TRIAL', "updatedAt" = NOW() WHERE id = $2`, [organizationName, organizationId]);
    await client.query(`UPDATE users SET "orgId" = $1, email = $2, "fullName" = $3, role = $4, "updatedAt" = NOW() WHERE "authUserId" = $5`, [organizationId, firstEmail, first[1], first[0], firstAuthUserId]);
    created.push({ role: first[0], fullName: first[1], email: firstEmail, authUserId: firstAuthUserId });

    for (const [role, fullName, slug] of roles.slice(1)) {
      const email = `qa.${slug}.${runId}@example.com`;
      const authUserId = await createAuthUser(email, fullName);
      await waitForProfile(client, authUserId);
      await client.query(`UPDATE users SET "orgId" = $1, email = $2, "fullName" = $3, role = $4, "updatedAt" = NOW() WHERE "authUserId" = $5`, [organizationId, email, fullName, role, authUserId]);
      created.push({ role, fullName, email, authUserId });
    }

    await client.query(`DELETE FROM organizations WHERE id <> $1 AND name LIKE '%''s Fleet'`, [organizationId]);
    await client.query(`DELETE FROM organization_settings WHERE "orgId" = $1`, [organizationId]);
    await client.query(`INSERT INTO organization_settings (id, "orgId", timezone, "odometerMaxDailyKm", "laborRatePerHour", "updatedAt") VALUES ($1, $2, 'Asia/Kolkata', 1000, 850, NOW())`, [randomUUID(), organizationId]);

    const driver = created.find((user) => user.role === "DRIVER");
    const fleetManager = created.find((user) => user.role === "FLEET_MANAGER");
    const mechanic = created.find((user) => user.role === "MECHANIC");
    const inventoryManager = created.find((user) => user.role === "INVENTORY_MANAGER");
    const vehicleId = randomUUID();
    await client.query(`INSERT INTO vehicles (id, "orgId", vin, "licensePlate", make, model, year, "currentOdometer", status, "updatedAt") VALUES ($1, $2, $3, $4, 'Ashok Leyland', 'Vahan QA Bus', 2024, 50000, 'ACTIVE', NOW())`, [vehicleId, organizationId, `QA-VIN-${runId}`, `QA-${runId.slice(-4)}`]);
    await client.query(`INSERT INTO vehicle_assignments (id, "orgId", "vehicleId", "driverId", active, "updatedAt") VALUES ($1, $2, $3, (SELECT id FROM users WHERE "authUserId" = $4), true, NOW())`, [randomUUID(), organizationId, vehicleId, driver.authUserId]);
    await client.query(`INSERT INTO components (id, "vehicleId", name, "expectedLifeKm", "lastServicedOdometer", "alertThresholdKm") VALUES ($1, $2, 'Left tire', 40000, 10000, 38000)`, [randomUUID(), vehicleId]);
    const partId = randomUUID();
    await client.query(`INSERT INTO inventory_parts (id, "orgId", sku, name, "binLocation", "quantityOnHand", "minReorderLevel", "unitCost") VALUES ($1, $2, 'QA-TIRE-01', 'Left tire 295/80R22.5', 'QA-A1', 12, 4, 18500)`, [partId, organizationId]);
    const vendorId = randomUUID();
    await client.query(`INSERT INTO vendors (id, "orgId", name, "contactPerson", phone, email, "updatedAt") VALUES ($1, $2, 'QA Fleet Parts Vendor', 'Anika QA', '+919999000000', 'qa.vendor@example.com', NOW())`, [vendorId, organizationId]);
    await client.query(`INSERT INTO purchase_orders (id, "orgId", "vendorId", status, "totalCost") VALUES ($1, $2, $3, 'OPEN', 222000)`, [randomUUID(), organizationId, vendorId]);
    await client.query(`INSERT INTO financial_records (id, "orgId", "vehicleId", type, category, amount, "transactionDate", "taxAmount", "approvalStatus") VALUES ($1, $2, $3, 'EXPENSE', 'MAINTENANCE', 18500, NOW(), 3330, 'APPROVED')`, [randomUUID(), organizationId, vehicleId]);
    await client.query(`INSERT INTO notifications (id, "orgId", "recipientId", title, message, type, severity, "sourceType", "isRead", "updatedAt") SELECT gen_random_uuid(), $1, id, 'QA maintenance signal', 'QA vehicle is ready for role workflow verification.', 'MAINTENANCE', 'INFO', 'SYSTEM', false, NOW() FROM users WHERE "authUserId" IN ($2, $3, $4)`, [organizationId, fleetManager.authUserId, mechanic.authUserId, inventoryManager.authUserId]);
    await client.query("COMMIT");

    console.log(JSON.stringify({ runId, organizationName, password, organizationId, vehicleId, users: created }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
