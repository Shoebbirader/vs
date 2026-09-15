import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.FLEETOPS_E2E_BASE_URL ?? "http://127.0.0.1:3000",
    browserName: "chromium",
    launchOptions: { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } },
    { name: "tablet", use: { ...devices["iPad Mini"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
