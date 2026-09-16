import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import pg from "pg";

const { Pool } = pg;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const baseUrl = (process.env.VAHANSYNC_FIRST_LOGIN_BASE_URL ?? "https://vahansync.com").replace(/\/$/, "");

if (!supabaseUrl || !serviceKey || !anonKey || !process.env.SUPABASE_DATABASE_URL) {
  throw new Error("Supabase server, browser, and database configuration is required for the disposable first-login verification.");
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const runId = Date.now().toString(36);
const ownerEmail = `vahansync.first-login.owner.${runId}@example.com`;
const invitedEmail = `vahansync.first-login.manager.${runId}@example.com`;
const password = `VahanSyncFirstLogin!${runId}A`;
const results = [];
let ownerAuthId;
let invitedAuthId;
let orgId;
let invitationId;

function record(name, status, detail) {
  results.push({ name, status, detail });
}

async function check(name, action) {
  try {
    const value = await action();
    record(name, "PASS", typeof value === "string" && value.length > 80 ? "credential obtained" : typeof value === "string" ? value : "completed");
    return value;
  } catch (error) {
    record(name, "FAIL", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function trpc(path, token, input, method = "POST") {
  const encoded = encodeURIComponent(JSON.stringify({ 0: { json: input } }));
  const response = await fetch(`${baseUrl}/api/trpc/${path}?batch=1${method === "GET" ? `&input=${encoded}` : ""}`, {
    method,
    headers: {
      accept: "application/json",
      "trpc-accept": "application/json",
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === "GET" ? undefined : JSON.stringify({ 0: { json: input } }),
  });
  const payload = await response.json();
  if (!response.ok || payload?.[0]?.error) throw new Error(`${path} failed: ${JSON.stringify(payload?.[0]?.error ?? payload).slice(0, 500)}`);
  return payload?.[0]?.result?.data?.json ?? payload?.[0]?.result?.data;
}

async function signIn(email) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("Password sign-in did not return a session.");
  return data.session.access_token;
}

try {
  ownerAuthId = await check("Create disposable Superadmin", async () => {
    const { data, error } = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { fullName: "VahanSync First Login Owner", needsOnboarding: true } });
    if (error || !data.user) throw error ?? new Error("Owner creation returned no user.");
    return data.user.id;
  });
  const ownerToken = await check("Authenticate disposable Superadmin", () => signIn(ownerEmail));
  await check("Provision disposable organization", () => trpc("onboarding.bootstrap", ownerToken, { orgName: `First Login QA ${runId}`, fullName: "VahanSync First Login Owner" }));
  const ownerSummary = await check("Resolve disposable organization summary", () => trpc("dashboard.summary", ownerToken, null, "GET"));
  orgId = ownerSummary?.org?.id;
  if (!orgId) throw new Error("Disposable organization did not resolve.");
  await check("Complete disposable organization onboarding", () => trpc("onboarding.complete", ownerToken, { orgName: `First Login QA ${runId}`, fullName: "VahanSync First Login Owner" }));
  const invitation = await check("Create Fleet Manager invitation", () => trpc("team.invite", ownerToken, { email: invitedEmail, role: "FLEET_MANAGER" }));
  invitationId = invitation?.id;
  if (!invitation?.tokenHash) throw new Error("Invitation did not return a join token.");

  await check("Complete first invited browser login without a hard reload", async () => {
    const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/join/${invitation.tokenHash}`, { waitUntil: "networkidle" });
      const initialDocumentNavigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
      await page.getByLabel(/full name/i).fill("VahanSync First Login Fleet Manager");
      await page.getByLabel(/create password/i).fill(password);
      await page.getByRole("button", { name: /create account and join organization/i }).click();
      await page.waitForURL(/\/fleet-manager$/, { timeout: 20_000 });
      try {
        await page.getByRole("button", { name: /sign out of VahanSync/i }).waitFor({ timeout: 20_000 });
      } catch (error) {
        const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 900);
        throw new Error(`Assigned role route did not render the authenticated workspace. URL: ${page.url()}. Visible state: ${body}. ${error instanceof Error ? error.message : String(error)}`);
      }
      const finalDocumentNavigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
      if (finalDocumentNavigationCount !== initialDocumentNavigationCount) throw new Error(`Expected SPA routing after invitation completion, but observed ${finalDocumentNavigationCount - initialDocumentNavigationCount} document reload(s).`);
      if (!/\/fleet-manager$/.test(page.url())) throw new Error(`Expected Fleet Manager route, received ${page.url()}.`);
    } finally {
      await context.close();
      await browser.close();
    }
    return "assigned workspace opened through SPA routing";
  });

  invitedAuthId = await check("Resolve disposable invited identity", async () => {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === invitedEmail.toLowerCase());
    if (!user) throw new Error("Invited Auth identity was not found after browser completion.");
    return user.id;
  });
} finally {
  try {
    await pool.query(`DELETE FROM invitations WHERE id = $1 OR email IN ($2, $3)`, [invitationId ?? "00000000-0000-0000-0000-000000000000", ownerEmail, invitedEmail]);
    if (orgId) {
      await pool.query(`DELETE FROM users WHERE "orgId" = $1`, [orgId]);
      await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    }
    if (invitedAuthId) await admin.auth.admin.deleteUser(invitedAuthId);
    if (ownerAuthId) await admin.auth.admin.deleteUser(ownerAuthId);
    const outstanding = await pool.query(`SELECT (SELECT COUNT(*) FROM invitations WHERE email IN ($1, $2)) + (SELECT COUNT(*) FROM users WHERE email IN ($1, $2)) AS count`, [ownerEmail, invitedEmail]);
    if (Number(outstanding.rows[0]?.count ?? 0) !== 0) throw new Error("Disposable first-login records remain after cleanup.");
    record("Verify disposable data cleanup", "PASS", "temporary organization, invitations, profiles, and Auth identities removed");
  } catch (error) {
    record("Verify disposable data cleanup", "FAIL", error instanceof Error ? error.message : String(error));
  } finally {
    await pool.end().catch(() => {});
  }
}

console.log(JSON.stringify({ runId, results }, null, 2));
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
