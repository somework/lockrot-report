import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { report2Url } from "./support/pages";
import { pageGolden } from "./support/report2/page-goldens";
import {
  advisoriesSurface,
  advisoryGroupHeads,
  advisoryRowPackages,
  advisoryRows,
} from "./support/report2/advisories";
import { assembleEmbed } from "../scripts/report2-embed.ts";

test.describe("report-2: the Advisories tab groups the S9 rows by package", () => {
  const { report: composite } = assembleEmbed("composite");
  const golden = pageGolden("composite");
  const rowsOf = (pkg: string): number =>
    composite.findings
      .find((f) => f.package === pkg)
      ?.signals.flatMap((signal) =>
        signal.id === "S9" ? (signal.data as { advisories: unknown[] }).advisories : [],
      ).length ?? 0;
  /** The packages with an advisory, in rank order: one group each. */
  const groupOrder = composite.findings
    .filter((f) => rowsOf(f.package) > 0)
    .sort((a, b) => a.rank - b.rank)
    .map((f) => f.package);

  test("the Security block and its answer lead, then one group per package with a row per S9 row", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    const lead = advisoriesSurface(page).locator(".al-lead");
    // The chips carry the severities, so the answer counts once and lists no severity.
    await expect(lead.locator(".al-answer")).toHaveText(`${golden.security.figure} ${golden.security.unit}.`);
    await expect(lead.getByRole("group", { name: "Advisories by severity" }).getByRole("button")).toHaveText(
      Object.entries(composite.security.severities).map(([id, count]) => `${id} ${String(count)}`),
    );
    await expect(lead).not.toContainText("Update now");
    await expect(advisoriesSurface(page)).not.toContainText("by severity:");
    await expect(advisoriesSurface(page).getByRole("columnheader")).toHaveText([
      "Severity",
      "Advisory",
      "Affects",
      "Fixed by",
    ]);
    // One group per package, in lockrot's rank order, never one per fix kind.
    await expect(advisoryGroupHeads(page)).toHaveText(
      groupOrder.map((pkg) => `${pkg} ${composite.findings.find((f) => f.package === pkg)?.version ?? ""}`),
    );
    await expect(advisoriesSurface(page).locator(".al-group-count")).toHaveText(
      groupOrder.map((pkg) => `${String(rowsOf(pkg))} ${rowsOf(pkg) === 1 ? "advisory" : "advisories"}`),
    );
    expect(await advisoryRowPackages(page)).toEqual(
      groupOrder.flatMap((pkg) => Array<string>(rowsOf(pkg)).fill(pkg)),
    );
    await expect(advisoryRows(page)).toHaveCount(composite.security.advisories.counted);
  });

  test("a row is named by package, severity and CVE, and says where its fix is released", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    const row = advisoriesSurface(page).getByRole("row", {
      name: "symfony/monolog-bridge, high, CVE-2026-45077",
    });
    await expect(row.locator(".ac-fixver")).toHaveText("v5.4.52");
    await expect(row.locator(".ac-where")).toHaveText("on 5.x");
    const monolog = golden.advisory_groups.find((group) => group.package === "symfony/monolog-bridge");
    await expect(row.locator(".ac2-note")).toHaveText(monolog?.fix_notes[0] ?? "");
    await expect(
      advisoriesSurface(page).locator('[role="row"][data-pkg="symfony/yaml"] .ac-where').first(),
    ).toHaveText("on your branch");
  });

  test("an unrated severity says in words what it counts as", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    const unrated = advisoriesSurface(page).locator(".ac-sev", { hasText: "unrated" }).first();
    await expect(unrated).toContainText("unrated");
    await expect(unrated.locator(".ac-counted")).toHaveText(
      golden.security.counted_as[0]?.replace(/^unrated, /, "") ?? "",
    );
  });

  test("the rail's fix filter keeps only the rows it names, and says the count without it", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=advisories&fix=upgrade");
    expect(await advisoryRowPackages(page)).toEqual(["symfony/monolog-bridge"]);
    await expect(advisoriesSurface(page).locator(".al-scope")).toHaveText(
      `Only advisories that match the filter are counted; without it there are ${String(composite.security.advisories.counted)}.`,
    );
  });

  test("a fragment opens its package and marks each of its rows current", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=advisories&pkg=symfony%2Fyaml");
    await expect(advisoriesSurface(page).locator('[role="row"][aria-current="true"]')).toHaveCount(
      rowsOf("symfony/yaml"),
    );
  });

  test("j walks the advisory rows top to bottom", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    await advisoryRows(page).first().focus();
    await page.keyboard.press("j");
    await expect(advisoryRows(page).nth(1)).toBeFocused();
  });

  test("the source id links to the advisory's own link, and the page links no URL it built", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    const id = advisoriesSurface(page).getByRole("link", { name: "PKSA-8zx5-v2nz-58pb" });
    await expect(id).toHaveAttribute("href", "https://github.com/advisories/GHSA-529h-vh3j-85hq");
    await expect(advisoriesSurface(page).locator('a[href*="nvd.nist.gov"]')).toHaveCount(0);
    // The CVE id beside it is text: one link per advisory.
    await expect(advisoriesSurface(page).getByRole("link", { name: "CVE-2026-49981" })).toHaveCount(0);
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
    await expect(advisoriesSurface(page).locator(".ci-tag")).toHaveText("check not run");
  });

  test("the overview band and the tab say that a lookup which did not run did not run", async ({ page }) => {
    await page.goto(report2Url("B-offline-dagger"));
    await expect(page.locator(".ledger-advisories")).toContainText("the advisory check did not run");
    await expect(page.locator(".ledger-advisories")).not.toContainText("incomplete");

    await page.getByRole("tab", { name: "Advisories 0, check not run" }).click();
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

test.describe("report-2: the rail names its unit beside a list of advisories (R2-42)", () => {
  test("titles the Severity and Fix groups as package counts on Advisories only", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=advisories");
    await expect(page.getByRole("group", { name: "Severity (packages)", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Fix (packages)", exact: true })).toBeVisible();

    await page.goto(report2Url("composite") + "#view=findings");
    await expect(page.getByRole("group", { name: "Severity", exact: true })).toBeVisible();
  });
});
