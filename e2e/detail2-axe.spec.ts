/**
 * SPEC §7.9.10: an axe pass on the report-2 detail sheet of B, F (accepted), B-baselined‡ (known),
 * A (a grouped advisory list) and the recorded drupal/core, every fold open, in both themes,
 * reports no colour-only or name violation.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sheetUrl } from "./support/pages";
import { openDetail2 } from "./support/report2/detail";

const CASES = [
  { name: "B", pkg: "symfony/monolog-bridge" },
  { name: "F", pkg: "symfony/polyfill-intl-idn" },
  { name: "B-baselined-dagger", pkg: "symfony/monolog-bridge" },
  { name: "A", pkg: "twig/twig" },
] as const;

async function openEveryFold(page: Page): Promise<void> {
  const sheet = page.locator('[data-surface="detail"]');
  const closed = sheet.locator(
    '.l1-btn[aria-expanded="false"], .d3-sev-btn[aria-expanded="false"], .detail-timeline-fold-btn[aria-expanded="false"]',
  );
  for (let i = 0; i < 100 && (await closed.count()) > 0; i++) await closed.first().click();
  for (const summary of await sheet.locator("details > summary").all()) await summary.click();
  const shell = sheet.getByRole("button", { name: /^Shell:/ });
  if ((await shell.count()) > 0) await shell.click();
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const { name, pkg } of CASES) {
    test(`${name}: the open sheet has no axe violation, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDetail2(page, name, pkg);
      await openEveryFold(page);

      const results = await new AxeBuilder({ page }).include('[data-surface="detail"]').analyze();

      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
    });
  }
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`the recorded drupal/core: the open sheet has no axe violation, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`${sheetUrl("drupal-site-drupal-core")}#pkg=${encodeURIComponent("drupal/core")}`);
    await page.locator('[data-surface="detail"]').waitFor();
    await openEveryFold(page);

    const results = await new AxeBuilder({ page }).include('[data-surface="detail"]').analyze();

    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
}
