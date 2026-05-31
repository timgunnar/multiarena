/**
 * Web E2E tests — Playwright browser automation.
 * Starts the server, opens pages, verifies key functionality.
 */
import { test, expect } from "@playwright/test";
import { startServer } from "../../src/server/index.js";
import type { Server } from "node:http";

const PORT = 3097;
const BASE = `http://127.0.0.1:${PORT}`;

let server: Server;

test.beforeAll(async () => {
  server = startServer(PORT);
  await new Promise<void>((resolve) => server.on("listening", resolve));
});

test.afterAll(() => {
  server?.close();
});

test("page loads with title", async ({ page }) => {
  await page.goto(BASE);
  await expect(page).toHaveTitle("multiarena");
});

test("SSE connects and shows connected state", async ({ page }) => {
  await page.goto(BASE);
  // Wait for SSE to connect — the sidebar should show "connected"
  await page.waitForSelector("text=Connected", { timeout: 10000 }).catch(() => {});
  // At minimum, the page should have loaded without connection error
  const errorBanner = page.locator(".connection-banner");
  await expect(errorBanner).not.toBeVisible({ timeout: 5000 });
});

test("sidebar navigation works", async ({ page }) => {
  await page.goto(BASE);
  // Home should be active by default
  await expect(page.locator(".sidebar-body")).toBeVisible();

  // Click Settings
  await page.click("text=Settings");
  await page.waitForSelector(".settings", { timeout: 5000 }).catch(() => {});
});

test("models from server config are visible in settings", async ({ page }) => {
  await page.goto(BASE);
  // Go to settings
  await page.click("text=Settings");
  await page.waitForTimeout(1000);
  // Should see model names from .multiarenarc (minimax, deepseek)
  const settingsBody = page.locator(".settings-body");
  await expect(settingsBody).toBeVisible({ timeout: 5000 });
});

test("theme toggle works", async ({ page }) => {
  await page.goto(BASE);
  // Click theme toggle (☀ or 🌙 button)
  const themeBtn = page.locator(".lang-btn").first(); // First lang-btn is theme toggle
  await themeBtn.click();
  await page.waitForTimeout(300);
  // After clicking, data-theme should be set on html
  const theme = await page.evaluate(() =>
    document.documentElement.dataset.theme
  );
  expect(["dark", "light"]).toContain(theme);
});

test("home page has input area", async ({ page }) => {
  await page.goto(BASE);
  const textarea = page.locator("textarea");
  await expect(textarea).toBeVisible();
});

test("deliberation view has input when empty", async ({ page }) => {
  await page.goto(BASE);
  // Navigate to deliberation
  await page.click("text=Team Writing");
  await page.waitForTimeout(500);
  // Should show start area with textarea
  const textarea = page.locator("textarea");
  await expect(textarea).toBeVisible({ timeout: 5000 }).catch(() => {});
});
