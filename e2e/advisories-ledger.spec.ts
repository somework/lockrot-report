import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, report2Url } from "./support/pages";
import {
  advisoriesSurface,
  advisoryGroupHeads,
  advisoryRowPackages,
  advisoryRows,
} from "./support/report2/advisories";
import { assembleEmbed } from "../scripts/report2-embed.ts";

/**
 * PD-ADV-1..4 (DESIGN.md §5): the Advisories tab answers first, then lists each advisory as one
 * ledger row under its fix shape, most severe first; Findings and All packages rows carry the same
 * advisory chip. `fixtures/bundles/mini-advisories.json`: six advisories on five packages, every
 * fix shape, prod and dev, dated one month to 2.6 years before the run.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test("the answer leads, then one row per advisory, grouped by fix shape and most severe first", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");

  await expect(page.locator(".al-answer")).toContainText(
    "6 advisories on 5 packages: 4 in production (1 critical, 1 high, 1 medium and 1 low)",
  );
  await expect(page.locator(".al-group-head h2")).toHaveText([
    "A release on the branch you are on",
    "Only a move to another branch",
    "No fix listed",
  ]);
  expect(await report.rows()).toEqual([
    "acme/http-client",
    "acme/http-client",
    "acme/yaml",
    "acme/templating",
    "acme/markdown",
    "acme/debug-toolbar",
  ]);
  // Wide, the column head captions the row's cells and the reported-ago axis.
  await expect(page.locator(".al-head")).toBeVisible();
  await expect(page.locator(".al-tick")).toHaveText(["0", "1y", "2y", "3y"]);
  await expect(page.locator(".ac-bar")).toHaveCount(6);
});

test("each row is named by its package, severity and CVE or id, so two on one package differ", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");
  await expect(
    page.getByRole("listitem", { name: "acme/http-client, critical, CVE-2026-31337" }),
  ).toHaveCount(1);
  await expect(page.getByRole("listitem", { name: "acme/http-client, medium, CVE-2026-29904" })).toHaveCount(
    1,
  );
  await expect(page.getByRole("listitem", { name: "acme/yaml, low, GHSA-p9xw-66fq-2mhv" })).toHaveCount(1);
});

test("advisories found by a check that may not have covered every package say so under the answer", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.miniAdvisoriesPartial, "view=advisories");
  await expect(page.locator(".al-answer")).toContainText("6 advisories on 5 packages");
  const partial = page.locator(".al-partial");
  await expect(partial).toContainText("this list may be partial");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const results = await new AxeBuilder({ page }).include(".al-top").analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  }
  await partial.getByRole("button", { name: "Run data" }).click();
  await expect.poll(() => report.hash()).toContain("view=run");
});

test("a count from an incomplete check says so in the band, the tab, the phone fold and the copied summary", async ({
  page,
}) => {
  // PD-ADV-7: mini-advisories-partial.json — six advisories, network_failures true.
  await page.addInitScript(() => {
    const writes: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = writes;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          writes.push(text);
          return Promise.resolve();
        },
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await report.goto(FIXTURES.miniAdvisoriesPartial);
  await expect(page.locator(".ledger-partial")).toContainText("Check incomplete");
  await expect(page.getByRole("tab", { name: /^Advisories/ })).toHaveAccessibleName(
    /^Advisories\s*6\s*,\s*check incomplete$/,
  );
  await page.getByRole("button", { name: "Copy summary" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.join("\n")))
    .toContain("6 security advisories on 5 packages (advisory check incomplete, so the list may be partial)");

  await page.setViewportSize({ width: 320, height: 800 });
  const fold = page.getByText("More about this lock").locator("xpath=ancestor::summary[1]");
  await expect(fold).toContainText("6 advisories, check incomplete");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("the reported-ago axis names the unit its ticks are in", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await report.gotoWithHash(FIXTURES.wallabag, "view=advisories");
  await expect(page.locator(".al-age-label")).toHaveText("Reported, months ago");
  await expect(page.locator(".al-tick")).toHaveText(["0", "6 mo", "12 mo"]);
  await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");
  await expect(page.locator(".al-age-label")).toHaveText("Reported, years ago");
});

test("a fragment opens its package and marks each of its rows current", async ({ page }) => {
  await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories&pkg=acme%2Fhttp-client");
  const current = page.locator('.adv[aria-current="true"]');
  await expect(current).toHaveCount(2);
  expect((await report.detail()).name).toBe("acme/http-client");
});

test("the same chip sits on a Findings row and an All packages row", async ({ page }) => {
  await report.goto(FIXTURES.miniAdvisories);
  await expect(page.locator('[data-pkg="acme/http-client"] .adv-chip')).toHaveText("2 advisories");
  await report.tab("packages");
  const chip = page.getByRole("row", { name: "acme/http-client" }).locator(".adv-chip");
  await expect(chip).toHaveText("2 advisories");
  await expect(chip).toHaveAttribute("title", "1 critical, 1 medium · fixed by 2.3.4 on your branch");
});

test("an incomplete check never reads as clean, and points at Run data", async ({ page }) => {
  await report.gotoWithHash(FIXTURES.advisoryIncomplete, "view=advisories");
  await expect(page.locator(".al-empty")).toContainText(
    "No advisory found; 2 packages could not be confirmed clear.",
  );
  // The same tag the non-empty partial state leads with (PD-ADV-7).
  await expect(page.locator(".al-empty .ci-tag")).toHaveText("Check incomplete");
  // No "0 of 0 advisories" above the sentence.
  await expect(page.locator(".count-line")).toHaveCount(0);
  await page.locator(".al-empty").getByRole("button", { name: "Run data" }).click();
  await expect.poll(() => report.hash()).toContain("view=run");
});

for (const width of [320, 390]) {
  test(`no horizontal overflow at ${String(width)}px, and on a phone the rows label their own cells`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expect(page.locator(".al-head")).toBeHidden();
    await expect(page.locator(".ac-reported").first()).toHaveText("reported 2026-08-12, 6 weeks ago");
  });
}

test("at 1024 the two-column rows keep the reported-ago axis, captioned over the right-hand column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await expect(page.locator(".al-head")).toBeVisible();
  await expect(page.locator(".al-col-pkg")).toBeHidden();
  await expect(page.locator(".al-tick")).toHaveText(["0", "1y", "2y", "3y"]);
  await expect(page.locator(".ac-bar")).toHaveCount(6);
  await expect(page.locator(".ac-bar").first()).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`no serious axe violation on the ledger, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories&pkg=acme%2Ftemplating");
    await expect(page.locator(".aledger")).toBeVisible();
    const results = await new AxeBuilder({ page }).include(".aledger").include(".al-top").analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
  });
}

test("the quiet-advisory note above Findings is narrowed by the search and the rail, like the list", async ({
  page,
}) => {
  const note = page.locator(".note", { hasText: "security advisory but no rot verdict" });

  await report.goto(FIXTURES.akaunting013);
  await expect(note.locator(".pkg-link-btn")).toHaveText(["laravel/framework", "dompdf/dompdf"]);

  await report.gotoWithHash(FIXTURES.akaunting013, "scope=direct");
  await expect(note.locator(".pkg-link-btn")).toHaveText(["laravel/framework"]);

  await report.gotoWithHash(FIXTURES.akaunting013, "q=dompdf");
  await expect(note.locator(".pkg-link-btn")).toHaveText(["dompdf/dompdf"]);

  await report.gotoWithHash(FIXTURES.akaunting013, "q=no-such-package");
  await expect(note).toHaveCount(0);
});

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
  });

  for (const width of [390, 1440]) {
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
