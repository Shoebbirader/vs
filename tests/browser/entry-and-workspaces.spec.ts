import { expect, test } from "@playwright/test";

const roleRoutes = ["/workspace", "/workspace/fleet-manager", "/workspace/mechanic", "/workspace/inventory-manager", "/workspace/driver", "/workspace/accountant"];

test("public landing exposes the two primary auth paths and a responsive visual artifact", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/FleetOps/i);
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /create (your )?organization/i }).first()).toBeVisible();
  await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }" });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);
  const screenshot = await page.screenshot({ fullPage: true, type: "jpeg", quality: 60 });
  expect(screenshot.byteLength).toBeGreaterThan(10_000);
  expect(screenshot).toMatchSnapshot("landing.jpg", { maxDiffPixels: 30_000, maxDiffPixelRatio: 0.05 });
  await testInfo.attach("landing-responsive.jpg", { body: screenshot, contentType: "image/jpeg" });
});

test("sign-in entry remains reachable at every supported viewport", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /sign in/i }).first().click();
  await expect(page.locator("body")).toContainText(/sign in|email|password/i);
});

test("authenticated session survives logout and relogin when E2E credentials are supplied", async ({ page }) => {
  const email = process.env.FLEETOPS_E2E_EMAIL;
  const password = process.env.FLEETOPS_E2E_PASSWORD;
  test.skip(!email || !password, "Set FLEETOPS_E2E_EMAIL and FLEETOPS_E2E_PASSWORD for the authenticated browser flow.");
  await page.goto("/");
  await page.getByRole("link", { name: /sign in/i }).first().click();
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: /sign in to FleetOps/i }).click();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  await page.getByRole("link", { name: /sign in/i }).first().click();
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: /sign in to FleetOps/i }).click();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible({ timeout: 15_000 });
});

for (const roleRoute of roleRoutes) {
  test(`role route ${roleRoute} never renders a blank document`, async ({ page }) => {
    await page.goto(roleRoute);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("body")).toContainText(/FleetOps|sign in|organization/i);
  });
}
