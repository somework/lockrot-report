import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { currentRenderer, FIXTURES } from "./support/pages";

const renderer = currentRenderer();
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("the empty lock (fixtures/bundles/empty-lockrot-self.json — 0 packages, 0 findings)", () => {
  test.beforeEach(async () => {
    await report.goto(FIXTURES.empty);
  });

  test("every tab reads zero and Findings has no rows", async () => {
    expect(await report.tabCount("findings")).toBe("0");
    expect(await report.tabCount("packages")).toBe("0");
    expect(await report.rows()).toEqual([]);
  });

  test("the boot auto-open never fires when there is nothing flagged", async () => {
    expect((await report.detail()).open).toBe(false);
  });

  test("M20: a clean report says nothing was flagged, not that a filter matched nothing", async () => {
    test.fail(
      renderer === "legacy",
      "M20: with FLAGGED empty, viewFindings() falls straight into the generic emptyState() — " +
        '"Nothing matches this filter." — even though no filter is active (report.js:464,664-666)',
    );
    const message = await report.emptyMessage();
    expect(message).not.toBeNull();
    expect(message?.toLowerCase()).not.toContain("matches this filter");
  });

  test("Advisories reads 0 of 0 the same way", async () => {
    await report.tab("advisories");
    expect(await report.rows()).toEqual([]);
  });
});

test.describe("the no-details fixture (fixtures/bundles/mini-split.json — details: [], K1)", () => {
  test.beforeEach(async () => {
    await report.goto(FIXTURES.miniSplit);
  });

  test("the bundle's details key round-trips even as an empty array, not an object", async () => {
    expect(await report.bundleKeys()).toEqual(expect.arrayContaining(["report", "details"]));
  });

  test("the one finding is not flagged (verdict ok) and does not appear on Findings", async () => {
    expect(await report.tabCount("findings")).toBe("0");
    expect(await report.rows()).toEqual([]);
  });

  test("its detail still renders — a measured libyears value with no explanatory metadata", async () => {
    await report.tab("packages");
    expect(await report.rows()).toEqual(["illuminate/contracts"]);
    await report.openPackage("illuminate/contracts");
    const detail = await report.detail();
    expect(detail.open).toBe(true);
    // libyears: 3.77, fixed(…, 1) -> "3.8"; no metadata means no "newest …" explanation to show.
    expect(detail.text).toContain("3.8");
    expect(detail.text).not.toContain("newest");
  });
});

test.describe("M21: Blast radius must not force a plural word onto a count of one", () => {
  test("mini.json has exactly one exposure entry: the count line should read it as singular", async () => {
    test.fail(
      renderer === "legacy",
      'M21: the count line is always "{n} of {m} direct requirements", 1-of-1 included ' + "(report.js:878)",
    );
    await report.goto(FIXTURES.mini);
    await report.tab("radius");
    const line = await report.countLine();
    expect(line).toBe("1 of 1 direct requirement");
  });
});
