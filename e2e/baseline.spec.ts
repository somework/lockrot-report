/**
 * PD-BASELINE-1..5 (DESIGN.md §5): the baseline surfaces, against `wallabag_baseline` — a synthetic
 * fixture (e2e/support/pages.ts): 4 new, 2 worsened, 63 already accepted, 3 entries gone from the
 * lock, `fail_on: high`.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("PD-BASELINE-1: the Findings tab's delta line", () => {
  test("says what is new, worsened, accepted and gone, above the list", async ({ page }) => {
    await report.goto(FIXTURES.wallabagBaseline);
    await expect(page.locator(".bl-answer")).toHaveText(
      "Against lockrot-baseline.json: 4 new and 2 worsened since it was written, 63 already accepted.",
    );
    await expect(page.locator(".bl-gone-note")).toHaveText(
      "3 entries in it are gone from the lock: doctrine/reflection, swiftmailer/swiftmailer and symfony/swiftmailer-bundle.",
    );
  });

  test("a count filters the list to the findings it counts, through the fragment's own since key", async ({
    page,
  }) => {
    await report.goto(FIXTURES.wallabagBaseline);
    const newToggle = page.getByRole("button", { name: "4 new", exact: true });
    await newToggle.click();
    await expect(newToggle).toHaveAttribute("aria-pressed", "true");
    expect(await report.rows()).toEqual([
      "sensio/framework-extra-bundle",
      "lcobucci/jwt",
      "smalot/pdfparser",
      "sebastian/type",
    ]);
    expect(await report.hash()).toContain("since=new");
    // The rail's Since row is the same filter, so it reads pressed too.
    await expect(
      page.getByRole("group", { name: "Filters" }).getByRole("button", { name: /New/ }),
    ).toHaveAttribute("aria-pressed", "true");

    await newToggle.click();
    expect(await report.rows()).toHaveLength(69);
  });

  test("a pasted link with since=worsened opens on the two worsened rows, the count pressed", async ({
    page,
  }) => {
    await report.gotoWithHash(FIXTURES.wallabagBaseline, "since=worsened");
    await expect(page.getByRole("button", { name: "2 worsened", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await report.rows()).toEqual(["javibravo/simpleue", "symfony/web-server-bundle"]);
  });

  test("a run without a baseline draws no delta line", async ({ page }) => {
    await report.goto(FIXTURES.wallabag);
    await expect(page.locator(".bl-top")).toHaveCount(0);
  });
});

test.describe("PD-BASELINE-2: a worsened row names the verdict it was accepted at", () => {
  test("worsened from stale, worsened from left-behind", async ({ page }) => {
    await report.goto(FIXTURES.wallabagBaseline);
    const row = (name: string) => page.locator(`[data-pkg="${name}"]`).first();
    await expect(row("javibravo/simpleue").locator(".tag")).toHaveText("worsened from stale");
    await expect(row("symfony/web-server-bundle").locator(".tag").first()).toHaveText(
      "worsened from left-behind",
    );
    await expect(row("lcobucci/jwt").locator(".tag")).toHaveText("new");
  });
});

test.describe("PD-BASELINE-3: the detail's baseline section comes first", () => {
  test("previous → current, ahead of why this priority", async ({ page }) => {
    await report.gotoWithHash(FIXTURES.wallabagBaseline, "pkg=javibravo%2Fsimpleue");
    const detail = page.getByRole("complementary", { name: "javibravo/simpleue" });
    const headings = await detail.locator(".detail-body h3").allTextContents();
    expect(headings[0]).toBe("Against the baseline");
    await expect(detail.locator(".bl-step .pill")).toHaveText(["stale", "silent"]);
    await expect(detail.locator(".detail-baseline")).toHaveText(
      "lockrot-baseline.json recorded stale; it is silent now. It has got worse since.",
    );
  });
});

test.describe("PD-BASELINE-4: Run data's baseline stat row", () => {
  test("four numbers and the entries gone from the lock", async ({ page }) => {
    await report.gotoWithHash(FIXTURES.wallabagBaseline, "view=run");
    await expect(page.locator(".bl-stat dd:not(.bl-gone)")).toHaveText(["4", "2", "63", "3"]);
    await expect(page.locator(".bl-gone-list li")).toHaveText([
      "doctrine/reflection",
      "swiftmailer/swiftmailer",
      "symfony/swiftmailer-bundle",
    ]);
  });
});

test.describe("PD-BASELINE-5: the gate's tally", () => {
  test("counts the findings at or above fail-on, and those the baseline does not accept", async ({
    page,
  }) => {
    await report.goto(FIXTURES.wallabagBaseline);
    await expect(page.locator(".gate-tally")).toHaveText("41 at or above · 4 outside the baseline");
    await page.getByRole("button", { name: /^gate: high/ }).click();
    await expect(page.locator(".fact-pop:not(.copy-pop)")).toContainText(
      "41 findings in this report are at or above high",
    );
  });
});
