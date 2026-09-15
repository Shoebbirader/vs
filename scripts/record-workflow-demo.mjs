import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.VAHANSYNC_RECORDING_BASE_URL ?? "https://vahansync.com").replace(/\/$/, "");
const outputDir = process.env.VAHANSYNC_RECORDING_OUTPUT_DIR ?? "/home/ubuntu/webdev-static-assets/vahansync-workflow-recording/raw";
const stateDir = path.join(outputDir, ".session-state");
const viewport = { width: 1280, height: 720 };

const roles = [
  { key: "superadmin", label: "Superadmin governance", sections: ["Command center", "Team", "Compliance vault", "P&L analytics", "Billing", "Profile"] },
  { key: "fleet_manager", label: "Fleet Manager", sections: ["Fleet manager workspace", "Vehicles", "Components", "Work orders"] },
  { key: "driver", label: "Driver", sections: ["Driver portal", "Profile"] },
  { key: "mechanic", label: "Mechanic", sections: ["Mechanic workspace", "Profile"] },
  { key: "technician", label: "Technician", sections: ["Technician workspace", "Profile"] },
  { key: "inventory_manager", label: "Inventory Manager", sections: ["Inventory manager workspace", "Inventory", "Vendors", "Purchase orders"] },
  { key: "accountant", label: "Accountant", sections: ["Accountant ledger", "Profile"] },
];
const requestedRoleKeys = (process.env.VAHANSYNC_RECORDING_ROLES ?? roles.map((role) => role.key).join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const recordingRoles = requestedRoleKeys.map((key) => {
  const role = roles.find((candidate) => candidate.key === key);
  if (!role) throw new Error(`Unknown recording role: ${key}`);
  return role;
});

function envKey(role, field) {
  return `VAHANSYNC_RECORDING_${role.toUpperCase()}_${field}`;
}

function credentialsFor(role) {
  return {
    email: process.env[envKey(role.key, "EMAIL")],
    password: process.env[envKey(role.key, "PASSWORD")],
  };
}

async function sleep(page, ms) {
  await page.waitForTimeout(ms);
}

async function signInAndSaveState(browser, role) {
  const { email, password } = credentialsFor(role);
  if (!email || !password) {
    throw new Error(`Missing recording credentials for ${role.label}. Set ${envKey(role.key, "EMAIL")} and ${envKey(role.key, "PASSWORD")} outside source control.`);
  }

  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /open workspace/i }).click();
  await page.getByRole("button", { name: /sign out of VahanSync/i }).waitFor({ timeout: 20_000 });

  const statePath = path.join(stateDir, `${role.key}.json`);
  await context.storageState({ path: statePath });
  await context.close();
  return statePath;
}

async function recordRole(browser, role, statePath) {
  const context = await browser.newContext({
    viewport,
    storageState: statePath,
    recordVideo: { dir: outputDir, size: viewport },
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/workspace`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /sign out of VahanSync/i }).waitFor({ timeout: 20_000 });
  await sleep(page, 1_800);

  for (const section of role.sections) {
    const target = page.getByRole("button", { name: new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (await target.count()) {
      await target.first().click();
      await sleep(page, 1_800);
    }
  }

  await sleep(page, 1_500);
  const video = page.video();
  await context.close();
  if (!video) throw new Error(`No browser video was created for ${role.label}.`);
  const sourcePath = await video.path();
  const outputPath = path.join(outputDir, `vahansync-workflow-${role.key}.webm`);
  await fs.rename(sourcePath, outputPath);
  return outputPath;
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const results = [];

try {
  for (const role of recordingRoles) {
    const statePath = await signInAndSaveState(browser, role);
    try {
      const videoPath = await recordRole(browser, role, statePath);
      results.push({ role: role.key, status: "recorded", videoPath });
    } finally {
      await fs.rm(statePath, { force: true });
    }
  }
} finally {
  await browser.close();
  await fs.rm(stateDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ baseUrl, outputDir, results }, null, 2));
