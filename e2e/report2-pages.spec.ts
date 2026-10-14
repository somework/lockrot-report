import { expect, test } from "@playwright/test";
import { report2Cases, report2Url } from "./support/pages";

/**
 * Every report-2 page built from lockrot's recorded bundle opens clean. The page does not render
 * report-2 yet: it shows the newer-schema banner, and that is the expected state here.
 */
const cases = report2Cases();

test("the build wrote report-2 pages", () => {
  expect(cases).toContain("composite");
  expect(cases.some((name) => name.startsWith("baselined-"))).toBe(true);
});

for (const name of cases) {
  test(`report-2 page ${name} loads with no console error and no uncaught exception`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));

    await page.goto(report2Url(name));
    await page.waitForLoadState("load");

    expect(problems).toEqual([]);
  });
}
