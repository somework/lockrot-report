import { defineConfig, devices } from "@playwright/test";

/**
 * The e2e suite runs against a built page on disk (`build/legacy-pages/` or, once the UI wave
 * produces it, `build/pages/`), reached as `file://...` — there is no server and so no `baseURL`
 * (DESIGN.md §6). `RENDERER` picks which set of pages `e2e/support/pages.ts` resolves to; it
 * defaults to `legacy` so a bare `npx playwright test` still runs against something real.
 *
 * Chromium is the one browser this suite always runs on. Firefox and WebKit are added only in CI:
 * they are slower to provision locally and the suite's job locally is fast iteration while making
 * the legacy baseline green (DESIGN.md §6 — "made green against the legacy page first").
 */
const projects = [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }];
if (process.env["CI"]) {
  projects.push(
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
  projects,
});
