/**
 * The release-branch timeline (`ui/detail/Timeline.tsx`, `domain/timeline.ts`) — PD-TIMELINE-1
 * through -4 (DESIGN.md §5). Raw class selectors are fine here, the same way `detail-scroll.spec.ts`
 * uses them: this file is written against this renderer's implementation, not the cross-renderer
 * accessibility contract `support/new.ts` keeps.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("PD-TIMELINE-1: the first year tick stays inside the axis (wallabag, sensio/framework-extra-bundle)", () => {
  test.describe("1440×900", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("its left edge does not sit left of the axis it plots on", async ({ page }) => {
      await report.goto(FIXTURES.wallabag);
      await report.openPackage("sensio/framework-extra-bundle");

      const axis = page.locator(".detail-timeline-axis");
      const firstTick = page.locator(".detail-timeline-tick-first");
      await expect(firstTick).toBeVisible();

      const axisBox = await axis.boundingBox();
      const tickBox = await firstTick.boundingBox();
      if (axisBox === null || tickBox === null) throw new Error("axis or first tick has no box");
      // A centering transform would put roughly half the label's own width to the left of
      // `left: 0%` — flush left instead, its own left edge cannot sit further left than the axis's.
      expect(tickBox.x).toBeGreaterThanOrEqual(axisBox.x - 1); // -1px: sub-pixel rounding
    });
  });

  test.describe("390×844", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the tick stays visible rather than pushed off past the edge entirely", async ({ page }) => {
      await report.goto(FIXTURES.wallabag);
      await report.openPackage("sensio/framework-extra-bundle");

      await expect(page.locator(".detail-timeline-tick-first")).toBeVisible();
    });
  });
});

test.describe("PD-TIMELINE-3/4: a package with no maintained branches (koel_koel, daverandom/resume)", () => {
  test("shows its own version once, and only the legend fact that applies", async ({ page }) => {
    await report.goto(FIXTURES.koel);
    await report.openPackage("daverandom/resume");

    // Scoped to the timeline itself: "The lock entry" and "Provenance", further down the same
    // panel, also print "v0.0.3" (the installed version, the last stable release) on their own
    // terms — this section's own lanes and legend are what PD-TIMELINE-3/4 are about.
    const lanesText = await page.locator(".detail-timeline-lane").allInnerTexts();
    const legendText = await page.locator(".detail-timeline-legend").innerText();

    // Both dated releases are this package's own past versions ("0.0.3"/"0.0.2"), each its own
    // "branch" — the tag label repeated the branch's own name back with a bare "v" prefix before
    // this fix ("0.0.3" then "v0.0.3").
    expect(lanesText.join(" ")).toContain("0.0.3");
    expect(lanesText.join(" ")).not.toContain("v0.0.3");
    expect(lanesText.join(" ")).toContain("0.0.2");
    expect(lanesText.join(" ")).not.toContain("v0.0.2");
    // The newest dated release is also the installed one, so nothing here is "still releasing" on
    // a branch the reader has moved off — that legend fact does not apply and is not shown.
    expect(legendText).toContain("you are on v0.0.3");
    expect(legendText).not.toContain("branch still releasing");
  });
});
