/**
 * The flagged packages shared by more than `exposure_rule.max_fan_in` direct requirements
 * (`unattributed`) are named in one note under the Blast radius rows.
 */
import { expect, test } from "@playwright/test";
import { report2Url } from "./support/pages";
import { radiusSurface } from "./support/report2/radius";
import { report2Pages } from "../scripts/report2-embed.ts";

test.describe("report-2: the packages shared by too many requirements", () => {
  test("are named in one note under the rows, each once, in unattributed order", async ({ page }) => {
    const embed = report2Pages().find((p) => p.name === "report2-baselined-wallabag-2.6")?.embed;
    const names = (embed?.report.unattributed ?? []).map((entry) => entry.package);
    expect(names.length).toBeGreaterThan(0);
    await page.goto(report2Url("baselined-wallabag-2.6") + "#view=radius");
    await expect(radiusSurface(page).locator(".r2-note", { hasText: "shared by too many" })).toHaveText(
      `${String(names.length)} flagged packages shared by too many requirements to list under one: ${names.join(", ")}.`,
    );
  });

  test("draw nothing when the run has none", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=radius");
    await expect(radiusSurface(page).locator(".r2-answer")).toBeVisible();
    await expect(radiusSurface(page).locator(".r2-note", { hasText: "shared by too many" })).toHaveCount(0);
  });
});
