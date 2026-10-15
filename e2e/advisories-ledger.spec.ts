import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { report2Url } from "./support/pages";
import {
  advisoriesSurface,
  advisoryGroupHeads,
  advisoryRowPackages,
  advisoryRows,
} from "./support/report2/advisories";
import { assembleEmbed } from "../scripts/report2-embed.ts";

test.describe("report-2: the Advisories tab groups the S9 rows by fix kind and branch", () => {
  const { report: composite } = assembleEmbed("composite");
  const rowsOf = (pkg: string): number =>
    composite.findings
      .find((f) => f.package === pkg)
      ?.signals.flatMap((signal) =>
        signal.id === "S9" ? (signal.data as { advisories: unknown[] }).advisories : [],
      ).length ?? 0;

  test("the answer leads, then one row per S9 row under its fix group", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    await expect(advisoriesSurface(page).locator(".al-answer")).toHaveText(
      "20 advisories on 4 packages, by severity: 1 critical, 4 high, 4 medium, 2 unrated, 9 low.",
    );
    // composite: polyfill-intl-idn updates on 1.x, yaml on 5.x, monolog-bridge upgrades to 5.x, and
    // twig needs a php floor raise to 3.x; fix_kinds orders update, upgrade, raise-php.
    await expect(advisoryGroupHeads(page)).toHaveText([
      "composer update · 1.x",
      "composer update · 5.x",
      "upgrade · 5.x",
      "php floor raise · 3.x",
    ]);
    expect(await advisoryRowPackages(page)).toEqual([
      ...Array<string>(rowsOf("symfony/polyfill-intl-idn")).fill("symfony/polyfill-intl-idn"),
      ...Array<string>(rowsOf("symfony/yaml")).fill("symfony/yaml"),
      ...Array<string>(rowsOf("symfony/monolog-bridge")).fill("symfony/monolog-bridge"),
      ...Array<string>(rowsOf("twig/twig")).fill("twig/twig"),
    ]);
    await expect(advisoryRows(page)).toHaveCount(composite.security.advisories.counted);
  });

  test("a row is named by package, severity and CVE, and says where its fix is released", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    const row = advisoriesSurface(page).getByRole("listitem", {
      name: "symfony/monolog-bridge, high, CVE-2026-45077",
    });
    await expect(row.locator(".ac-fixver")).toHaveText("v5.4.52");
    await expect(row.locator(".ac-where")).toHaveText("on 5.x");
    // composite: composer.json's ^2.6 holds monolog-bridge below 5.x.
    await expect(row.locator(".ac2-note")).toHaveText("held by composer.json");
    await expect(advisoriesSurface(page).locator('li[data-pkg="symfony/yaml"] .ac-where').first()).toHaveText(
      "on your branch",
    );
  });

  test("an unrated severity says in words what it counts as", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    await expect(advisoriesSurface(page).locator(".ac-sev", { hasText: "unrated" }).first()).toHaveText(
      "unrated, counted as medium",
      { useInnerText: false },
    );
  });

  test("the rail's fix filter keeps only the rows it names, and says the count without it", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=advisories&fix=upgrade");
    expect(await advisoryRowPackages(page)).toEqual(["symfony/monolog-bridge"]);
    await expect(advisoriesSurface(page).locator(".al-scope")).toHaveText(
      "Only advisories that match the filter are counted; without it there are 20.",
    );
  });

  test("a fragment opens its package and marks each of its rows current", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=advisories&pkg=symfony%2Fyaml");
    await expect(advisoriesSurface(page).locator('li[aria-current="true"]')).toHaveCount(
      rowsOf("symfony/yaml"),
    );
  });

  test("j walks the advisory rows top to bottom", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    await advisoryRows(page).first().focus();
    await page.keyboard.press("j");
    await expect(advisoryRows(page).nth(1)).toBeFocused();
  });

  test("a complete lookup with nothing vulnerable reads clean", async ({ page }) => {
    await page.goto(report2Url("C") + "#view=advisories");
    await expect(advisoriesSurface(page).locator(".al-answer")).toHaveText("No advisory affects this lock.");
    await expect(advisoriesSurface(page).locator(".clean-mark")).toHaveCount(1);
    // No "0 of 0 advisories" over the tab's own sentence.
    await expect(page.locator(".count-line")).toHaveCount(0);
  });

  test("a lookup that did not run never reads clean", async ({ page }) => {
    await page.goto(report2Url("B-offline-dagger") + "#view=advisories");
    await expect(advisoriesSurface(page).locator(".al-answer")).toHaveText(
      "No advisory found (not checked).",
    );
    await expect(advisoriesSurface(page).locator(".al-clean")).toHaveCount(0);
    await expect(advisoriesSurface(page).locator(".ci-tag")).toHaveText("Check incomplete");
  });

  test("the overview band and the tab hedge the same run, by one test", async ({ page }) => {
    await page.goto(report2Url("B-offline-dagger"));
    await expect(page.locator(".ledger-advisories")).toContainText(
      "no advisory found, but the advisory check was incomplete",
    );

    await page.getByRole("tab", { name: /^Advisories/ }).click();
    await expect(advisoriesSurface(page).locator(".ci-tag")).toBeVisible();
  });

  for (const width of [320, 390, 1024, 1440]) {
    test(`no horizontal overflow at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(report2Url("composite") + "#view=advisories");
      await expect(advisoryRows(page).first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`no serious axe violation on the tab, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(report2Url("composite") + "#view=advisories&pkg=twig%2Ftwig");
      await expect(advisoryRows(page).first()).toBeVisible();
      const results = await new AxeBuilder({ page }).include('[data-surface="advisories"]').analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    });
  }
});
