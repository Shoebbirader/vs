import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.VAHANSYNC_RECORDING_BASE_URL ?? "https://vahansync.com").replace(/\/$/, "");
const outputDir = process.env.VAHANSYNC_RECORDING_OUTPUT_DIR ?? "/home/ubuntu/webdev-static-assets/vahansync-workflow-recording/actions";
const stateDir = path.join(outputDir, ".session-state");
const viewport = { width: 1280, height: 720 };
const runLabel = process.env.VAHANSYNC_ACTION_LABEL ?? `Route-readiness torque confirmation ${new Date().toISOString().slice(0, 10)}`;
const actionStep = process.env.VAHANSYNC_ACTION_STEP ?? "all";
const shouldRun = (step) => actionStep === "all" || actionStep === step;

const roles = {
  fleetManager: { key: "FLEET_MANAGER", label: "Fleet Manager" },
  technician: { key: "TECHNICIAN", label: "Technician" },
  driver: { key: "DRIVER", label: "Driver" },
  accountant: { key: "ACCOUNTANT", label: "Accountant" },
};

function credentials(role) {
  const email = process.env[`VAHANSYNC_RECORDING_${role.key}_EMAIL`];
  const password = process.env[`VAHANSYNC_RECORDING_${role.key}_PASSWORD`];
  if (!email || !password) throw new Error(`Missing runtime-only credentials for ${role.label}.`);
  return { email, password };
}

async function waitForWorkspace(page) {
  await page.getByRole("button", { name: /sign out of VahanSync/i }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1_200);
}

async function storageStateFor(browser, role) {
  const { email, password } = credentials(role);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /open workspace/i }).click();
  await waitForWorkspace(page);
  const statePath = path.join(stateDir, `${role.key.toLowerCase()}.json`);
  await context.storageState({ path: statePath });
  await context.close();
  return statePath;
}

async function recordRole(browser, role, operation) {
  const statePath = await storageStateFor(browser, role);
  const context = await browser.newContext({ viewport, storageState: statePath, recordVideo: { dir: outputDir, size: viewport } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/workspace`, { waitUntil: "networkidle" });
    await waitForWorkspace(page);
    await operation(page);
    await page.waitForTimeout(1_800);
    const video = page.video();
    await context.close();
    if (!video) throw new Error(`No browser video created for ${role.label}.`);
    const sourcePath = await video.path();
    const targetPath = path.join(outputDir, `vahansync-action-${role.key.toLowerCase()}-${actionStep}.webm`);
    await fs.rename(sourcePath, targetPath);
    return targetPath;
  } finally {
    await fs.rm(statePath, { force: true });
    if (context) await context.close().catch(() => {});
  }
}

async function openWorkOrders(page) {
  await page.getByRole("button", { name: /^Work orders$/i }).click();
  await page.getByLabel("Work order title").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(900);
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const results = [];

try {
  if (shouldRun("dispatch")) {
    const fleetDispatch = await recordRole(browser, roles.fleetManager, async (page) => {
      await openWorkOrders(page);
      const form = page.locator("form").filter({ has: page.getByLabel("Work order title") });
      await form.locator("select").nth(0).selectOption({ index: 1 });
      await form.getByLabel("Work order title").fill(runLabel);
      await form.locator("textarea").fill("Controlled route-readiness follow-up: verify wheel torque and release the VIN-linked coach for the next scheduled route.");
      await form.locator("select").nth(1).selectOption({ index: 2 });
      await form.locator("select").nth(2).selectOption({ index: 2 });
      await form.getByRole("button", { name: /dispatch work order/i }).click();
      await page.getByText(runLabel, { exact: false }).last().waitFor({ timeout: 15_000 });
    });
    results.push({ role: roles.fleetManager.key, action: "dispatch", videoPath: fleetDispatch });
  }

  if (shouldRun("technician")) {
    const technicianCompletion = await recordRole(browser, roles.technician, async (page) => {
    await page.getByText(runLabel, { exact: false }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Start work$/i }).click();
    await page.getByRole("button", { name: /^Complete$/i }).click();
    await page.getByLabel("Labor hours").fill("0.75");
    await page.getByLabel("Repair notes").fill("Road-test torque confirmation completed. Wheel-fastener torque verified and the vehicle is ready for Fleet Manager review.");
    await page.getByLabel(/Safety isolation and vehicle secured/i).check();
    await page.getByLabel(/Diagnosis and affected component confirmed/i).check();
    await page.getByLabel(/Repair quality and handoff evidence checked/i).check();
    await page.getByRole("button", { name: /save checklist/i }).click();
    await page.getByRole("button", { name: /save and complete/i }).click();
      await page.getByText(runLabel, { exact: false }).first().waitFor({ timeout: 15_000 });
    });
    results.push({ role: roles.technician.key, action: "execute_and_submit", videoPath: technicianCompletion });
  }

  if (shouldRun("fleet_approval")) {
    const fleetApproval = await recordRole(browser, roles.fleetManager, async (page) => {
      await openWorkOrders(page);
      await page.getByText(runLabel, { exact: false }).first().waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: /approve handoff/i }).click();
      await page.getByText(runLabel, { exact: false }).first().waitFor({ timeout: 15_000 });
    });
    results.push({ role: roles.fleetManager.key, action: "approve", videoPath: fleetApproval });
  }

  if (shouldRun("driver")) {
    const driverHandoff = await recordRole(browser, roles.driver, async (page) => {
      await page.getByRole("button", { name: "Driver portal", exact: true }).click();
    await page.getByLabel("Vehicle").first().selectOption({ index: 1 });
    await page.getByLabel("Odometer \(km\)").first().fill("50400");
    await page.getByRole("button", { name: /submit odometer/i }).click();
    await page.getByLabel("Vehicle").nth(1).selectOption({ index: 1 });
    await page.getByLabel("Notes").fill("Post-maintenance road-readiness check passed; steering response and tyre condition verified before route release.");
    await page.getByRole("button", { name: /submit inspection/i }).click();
    await page.getByText(/POST TRIP|PRE TRIP/i).last().waitFor({ timeout: 15_000 });
    });
    results.push({ role: roles.driver.key, action: "odometer_and_dvir", videoPath: driverHandoff });
  }

  if (shouldRun("accountant")) {
    const accountantClose = await recordRole(browser, roles.accountant, async (page) => {
      await page.getByRole("button", { name: "Accountant ledger", exact: true }).click();
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: /add to ledger/i }) });
      await form.getByLabel("Vehicle").selectOption({ index: 1 });
      await form.getByRole("spinbutton", { name: "Amount (₹)", exact: true }).fill("125");
      await form.getByLabel("Invoice number").fill("VSYNC-TOLL-2026-001");
      await form.getByLabel("Vendor / payee").fill("Controlled route toll");
      await form.getByLabel("Payment method").fill("UPI");
      await form.getByRole("button", { name: /add to ledger/i }).click();
      await page.getByRole("button", { name: /^Reconcile$/i }).last().waitFor({ timeout: 15_000 });
      const ref = page.getByLabel(/Reconciliation reference/).last();
      await ref.fill("TOLL-DEMO-2026-001");
      await page.getByRole("button", { name: /^Reconcile$/i }).last().click();
    });
    results.push({ role: roles.accountant.key, action: "ledger_and_reconcile", videoPath: accountantClose });
  }
} finally {
  await browser.close();
  await fs.rm(stateDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ runLabel, baseUrl, outputDir, results }, null, 2));
