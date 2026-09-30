/**
 * Where a package came from, where its replacement lives, what a run note points at and whether an
 * advisory's fix was looked for are read from lockrot's own fields (`origin`, `replacement_url`,
 * `note_details`, S9's `releases_read`), never guessed; a report without the field draws nothing in
 * their place.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test("koel 0.13: a package links its origin's page, and one with no package_url links nothing", async () => {
  await report.goto(FIXTURES.koel013);
  await report.tab("packages");
  expect(await report.packageLinkHref("algolia/algoliasearch-client-php")).toBe(
    "https://packagist.org/packages/algolia/algoliasearch-client-php",
  );
  expect(await report.packageLinkHref("teamtnt/laravel-scout-tntsearch-driver")).toBeNull();
});

test("koel, an older report: no field places a package, so none is linked", async () => {
  await report.goto(FIXTURES.koel);
  await report.tab("packages");
  expect(await report.packageLinkHref("algolia/algoliasearch-client-php")).toBeNull();
});

test("mini-0.13-edges: another registry's page is linked and named after that registry", async ({ page }) => {
  await report.goto(FIXTURES.miniEdges013);
  await report.tab("packages");
  expect(await report.packageLinkHref("wp-plugin/acme-forms")).toBe(
    "https://wp-packages.org/packages/wp-plugin/acme-forms",
  );
  expect(await report.packageLinkHref("acme/private-sdk")).toBeNull();
  expect(await report.packageLinkHref("acme/legacy_")).toBeNull();

  await report.openPackage("wp-plugin/acme-forms");
  await expect(report.detailRegistryLinks("wp-plugin/acme-forms")).toHaveText(["wp-packages.org"]);
  await page
    .getByRole("complementary", { name: "wp-plugin/acme-forms" })
    .getByText("Provenance", { exact: true })
    .click();
  await expect(report.provenanceOrigin("wp-plugin/acme-forms")).toHaveText(
    /^Origin\s*from\s*a Composer repository\s*registry\s*wp-packages\.org$/,
  );
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test("mini-0.13-edges: a long registry name wraps inside the detail panel", async ({ page }) => {
    await report.gotoWithHash(FIXTURES.miniEdges013, "pkg=wp-plugin%2Facme-forms");
    const detail = page.getByRole("complementary", { name: "wp-plugin/acme-forms" });
    const link = detail.locator(".detail-links").getByRole("link");
    await expect(link).toHaveText(["wp-packages.org"]);
    // The schema lets `origin.registry` be any host; lockrot names only short ones today.
    await link.evaluate((el) => {
      el.textContent =
        "artifact-registry-for-internal-private-packages.engineering-platform.corp.example.com";
    });
    const [scroll, client] = await detail.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(client);
    const [panel, box] = await Promise.all([detail.boundingBox(), link.boundingBox()]);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((panel?.x ?? 0) + (panel?.width ?? 0));
  });
});

test("mini-0.13-edges: a replacement is linked only where replacement_url says", async ({ page }) => {
  await report.gotoWithHash(FIXTURES.miniEdges013, "pkg=acme%2Fretired-api");
  await expect(report.replacementLink("acme/retired-api", "acme/new-api")).toHaveAttribute(
    "href",
    "https://packagist.org/packages/acme/new-api",
  );

  await report.gotoWithHash(FIXTURES.miniEdges013, "pkg=acme%2Fmoved-out");
  await expect(page.getByRole("complementary", { name: "acme/moved-out" })).toContainText(
    "Its named replacement is acme/new-away.",
  );
  await expect(report.replacementLink("acme/moved-out")).toHaveCount(0);
});

test("mini-0.13-edges: each run note links the page lockrot names for it, and only that", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.miniEdges013, "view=run");
  const notes = page.locator(".run-sections .note");
  await expect(notes).toHaveCount(21);
  await expect(notes.first().getByRole("link", { name: "what this means" })).toHaveAttribute(
    "href",
    "https://lockrot.dev/notes/#offline",
  );
  const unknown = notes.filter({ hasText: "acme licence scan skipped 2 packages" });
  await expect(unknown).toHaveText("acme licence scan skipped 2 packages");
  await expect(unknown.getByRole("link")).toHaveCount(0);
  await expect(page.locator(".run-sections .note a[href^='https://lockrot.dev/notes/#']")).toHaveCount(20);
});

test("a note that counts repositories lists its first twenty on request, as text, and prints them all", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.wallabagOfflineStrict013, "view=run");
  const note = page
    .locator(".run-sections .note")
    .filter({ hasText: "GitHub unreachable for 186 repositories" });
  const toggle = note.getByRole("button", { name: "Which 186: the repositories" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await page.keyboard.press("Enter");
  const list = page.getByRole("group", { name: "Which 186: the repositories" });
  await expect(list.locator("li")).toHaveCount(20);
  await expect(list.locator("li").first()).toHaveText(
    "github.com/BabDev/PagerfantaBundle — offline and not cached: https://api.github.com/repos/BabDev/PagerfantaBundle",
  );
  await expect(list.locator("a")).toHaveCount(0);
  await expect(list.locator(".note-repos-more")).toContainText("166 more.");
  const all = list.getByRole("button", { name: "All 186 repositories" });
  await all.focus();
  await page.keyboard.press("Enter");
  await expect(all).toHaveAttribute("aria-expanded", "true");
  await expect(list.locator("li")).toHaveCount(186);
  await expect(all).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(list.locator("li")).toHaveCount(20);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  await page.emulateMedia({ media: "print" });
  const printed = page.locator(".print-doc .note-repos").first();
  await expect(printed).toBeVisible();
  await expect(printed.locator("li")).toHaveCount(186);
  await expect(page.locator(".print-doc .note .l1-btn")).toHaveCount(0);
});

test("mini-0.13-edges: only the rate-limited, unreachable and not-found notes list repositories", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.miniEdges013, "view=run");
  const listed = page.locator(".run-sections .note").filter({ has: page.locator(".note-repos") });
  await expect(listed).toHaveCount(4);
  await expect(listed.nth(1)).toContainText("GitLab unreachable");
  await listed.nth(1).getByRole("button", { name: "Which one: the repository" }).click();
  await expect(listed.nth(1).locator(".note-repos li")).toHaveText(
    "gitlab.com/acme/direct-e — curl error 6 while downloading https://gitlab.com/api/v4/projects/acme%2Fdirect-e: Could not resolve host: gitlab.com",
  );
  const results = await new AxeBuilder({ page }).include(".run-sections").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
});

test("koel, an older report: its note is shown with no link the page would have to guess", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.koel, "view=run");
  await expect(page.locator(".run-sections .note")).toHaveCount(1);
  await expect(page.locator(".run-sections .note a")).toHaveCount(0);
});

test("mini-0.13-edges: an advisory whose releases were not read says its fix was not checked", async ({
  page,
}) => {
  await report.goto(FIXTURES.miniEdges013);
  await report.tab("advisories");
  const row = page.getByRole("listitem", { name: /^acme\/silent-snapshot, / });
  await expect(row.locator(".ac-fix")).toHaveText("fix not checked");
  await expect(page.getByRole("list", { name: "Fix not checked" })).toContainText("silent-snapshot");
  await expect(page.getByRole("list", { name: "No fix listed" })).not.toContainText("silent-snapshot");

  await report.openPackage("acme/silent-snapshot");
  const detail = page.getByRole("complementary", { name: "acme/silent-snapshot" });
  await expect(detail.locator(".detail-rung-version")).toHaveText(["not checked"]);
  await detail.getByText("Every advisory").click();
  await expect(detail.locator(".detail-advisory-meta")).toContainText("fix not checked");
  await expect(detail).not.toContainText("no fix listed");
});
