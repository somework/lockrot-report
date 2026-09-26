import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

/**
 * history.md item 5: three browser calls (`history.replaceState`, `localStorage`, `dialog.showModal`)
 * throw in an opaque-origin/sandboxed frame even though feature-detection says they exist, and each
 * one is guarded so the page keeps working instead of going blank. Reproduced here by overriding the
 * call to throw on the *top-level* page via `addInitScript` — the same code path a real sandboxed
 * `<iframe sandbox="allow-scripts">` (no `allow-same-origin`) would hit, without standing one up.
 * (`showModal()` throwing is covered on its own in theme-and-glossary.spec.ts's M28 section, since
 * it needs the glossary open/position assertions that live there.)
 *
 * The guard came from the legacy page, and this page has to keep it, unconditionally.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("a history.replaceState() that throws must not stop the page", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      history.replaceState = () => {
        throw new DOMException("blocked", "SecurityError");
      };
    });
  });

  test("tab switching still renders, even though writing the hash now always throws", async () => {
    await report.goto(FIXTURES.mini);
    expect(await report.rows()).toEqual(["vendor/transitive", "vendor/snapshot"]);
    await report.tab("packages");
    expect(await report.activeTab()).toBe("packages");
    expect(await report.rows()).toHaveLength(4);
  });
});

test.describe("a localStorage that throws must not stop theme switching", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
  });

  test("the page still boots and the theme still switches for the current view", async () => {
    await report.goto(FIXTURES.mini);
    expect(await report.rows()).toEqual(["vendor/transitive", "vendor/snapshot"]);
    const before = await report.theme();
    await report.toggleTheme();
    // In-memory state still flips even though persistence silently fails.
    expect(await report.theme()).not.toBe(before);
    expect(await report.themeStorageValue()).toBeNull();
  });
});

test.describe("bundle shape (history.md item 7)", () => {
  test("the embedded bundle has exactly {report, details} at its top level", async () => {
    await report.goto(FIXTURES.mini);
    const keys = (await report.bundleKeys()).slice().sort();
    expect(keys).toEqual(["details", "report"]);
  });

  test("a document from before per-finding baseline state still renders (mini.json has none at all)", async () => {
    await report.goto(FIXTURES.mini);
    expect(await report.rows()).toEqual(["vendor/transitive", "vendor/snapshot"]);
  });
});
