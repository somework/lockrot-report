/**
 * PD-BASELINE-1..6 (DESIGN.md §5): the baseline surfaces, against `wallabag_baseline` (synthetic, no
 * gate fields) and `wallabag_baseline-older-0.13`, whose findings carry their own `gate`.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("PD-BASELINE-1/7: the delta line, in the summary band", () => {
  test("says what is new, worsened, accepted and gone, straight under the lead", async ({ page }) => {
    await report.goto(FIXTURES.wallabagBaseline);
    // PD-BASELINE-7: in the band, under the lead, ahead of the tier — not over the list.
    await expect(page.locator(".ledger > .ledger-lead + .bl-top")).toHaveCount(1);
    await expect(page.locator(".shell-main .bl-top")).toHaveCount(0);
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
      "lockrot-baseline.json accepted it as stale; it is silent now.",
    );
  });

  test("an accepted package says nothing about the build when its finding carries no gate", async ({
    page,
  }) => {
    await report.gotoWithHash(FIXTURES.wallabagBaseline, "pkg=behat%2Ftransliterator");
    const detail = page.getByRole("complementary", { name: "behat/transliterator" });
    await expect(detail.locator(".detail-baseline")).toHaveText(
      "Already accepted in lockrot-baseline.json as abandoned.",
    );
  });

  test("the section says where it stands against the file; the line under the pills says the run", async ({
    page,
  }) => {
    await report.gotoWithHash(FIXTURES.wallabagBaselineOlder013, "pkg=sensio%2Fframework-extra-bundle");
    const exempt = page.getByRole("complementary", { name: "sensio/framework-extra-bundle" });
    await expect(exempt.locator(".detail-baseline")).toHaveText(
      "Already accepted in wallabag-older.baseline.json as abandoned.",
    );
    await expect(exempt.locator(".detail-gate")).toHaveText("does not fail · meets --fail-on=high, accepted");

    await report.gotoWithHash(FIXTURES.wallabagBaselineOlder013, "pkg=craue%2Fconfig-bundle");
    const fails = page.getByRole("complementary", { name: "craue/config-bundle" });
    await expect(fails.locator(".detail-baseline")).toHaveText(
      "Not in wallabag-older.baseline.json: new since it was written.",
    );
    await expect(fails.locator(".detail-gate")).toHaveText("fails this run · meets --fail-on=high");

    // Known, but it does not reach fail-on: nothing exempts it, and the run is not mentioned.
    await report.gotoWithHash(FIXTURES.wallabagBaselineOlder013, "pkg=sebastian%2Fresource-operations");
    const quiet = page.getByRole("complementary", { name: "sebastian/resource-operations" });
    await expect(quiet.locator(".detail-baseline")).toHaveText(/^Already accepted/);
    await expect(quiet.locator(".detail-gate")).toHaveCount(0);
  });

  test("an exemption other than the baseline is named as written, not left silent", async ({ page }) => {
    await report.gotoWithHash(FIXTURES.miniEdges013, "pkg=acme%2Ffuture-step");
    const detail = page.getByRole("complementary", { name: "acme/future-step" });
    await expect(detail.locator(".detail-baseline")).toHaveText(
      "Not in lockrot-baseline.json: new since it was written.",
    );
    await expect(detail.locator(".detail-gate")).toHaveText(
      "does not fail · meets --fail-on=high, exempt: waiver",
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
    // PD-BASELINE-6: each count lists its findings.
    await page.locator(".bl-stat-btn", { hasText: /^2$/ }).click();
    await expect(page.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
    expect(await report.rows()).toEqual(["javibravo/simpleue", "symfony/web-server-bundle"]);
    expect(await report.hash()).toContain("since=worsened");
  });
});

test.describe("PD-GATE-2: the Against sentence closes on how many fail this run", () => {
  test("the count is lockrot's own gate, and opens what ties the exemptions to 'already accepted'", async ({
    page,
  }) => {
    await report.goto(FIXTURES.wallabagBaselineOlder013);
    await expect(page.locator(".gate-fact")).toHaveText("this run fails · --fail-on=high");
    const answer = page.locator(".bl-answer");
    await expect(answer).toContainText("43 already accepted; 12 fail this run by --fail-on=high.");
    // The header says the flag, so the sentence's echo of it stays out of sight.
    await expect(answer.locator(".gate-echo")).toBeHidden();
    const why = answer.getByRole("button", { name: "12 fail this run" });
    await expect(why).toHaveAttribute("aria-expanded", "false");
    await why.click();
    await expect(why).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(".gate-why");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Fails on priority high or higher. 42 packages meet it: 12 fail.");
    await expect(panel).toContainText("30 of the 43 already accepted meet it, so they do not fail.");
    // One name for the state: the summary's "accepted", never "exempt by the baseline".
    await expect(panel).not.toContainText("exempt by the baseline");
  });

  test("a report whose findings carry no gate draws no clause, whatever its fail-on", async ({ page }) => {
    await report.goto(FIXTURES.wallabagBaseline);
    await expect(page.getByRole("button", { name: /^gate: high/ })).toBeVisible();
    await expect(page.locator(".bl-answer")).not.toContainText("fail this run");
    await expect(page.locator(".gate-fact")).toHaveCount(0);
  });

  test("the rail's 'Fails this run' lists exactly the 12, beside the Since rows", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await report.goto(FIXTURES.wallabagBaselineOlder013);
    const row = page.getByRole("group", { name: "Filters" }).getByRole("button", { name: /^Fails this run/ });
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    expect((await report.rows()).sort()).toEqual([
      "craue/config-bundle",
      "doctrine/event-manager",
      "grandt/relativepath",
      "lcobucci/jwt",
      "mnapoli/piwik-twig-extension",
      "scheb/2fa-backup-code",
      "scheb/2fa-bundle",
      "scheb/2fa-email",
      "scheb/2fa-google-authenticator",
      "scheb/2fa-trusted-device",
      "spomky-labs/otphp",
      "symfony/webpack-encore-bundle",
    ]);
    expect(await report.hash()).toContain("gate=fails");
  });

  test("the rail's Since title keeps the file name whole, in its own case", async ({ page }) => {
    await report.goto(FIXTURES.wallabagBaseline);
    await expect(page.locator(".rail-path")).toHaveText("lockrot-baseline.json");
    const box = await page.locator(".rail-path").boundingBox();
    // One line of 11.5px mono: well under two lines' height.
    expect(box?.height ?? 99).toBeLessThan(22);
  });
});
