/**
 * The live example of "How the score works" (SPEC §7.9.12): the score of the finding the reader
 * opened, else of the first graded finding by rank, else the words that nothing is flagged.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { openDetail2 } from "./support/report2/detail";
import { ruleRows, runSurface } from "./support/report2/run";

const example = (page: Page) => runSurface(page).locator(".run2-example");
const exampleText = (page: Page) => example(page).locator(".run2-example-text");

async function axeClean(page: Page): Promise<void> {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect
      .poll(async () =>
        (await new AxeBuilder({ page }).include(".run2-example").analyze()).violations.map((v) => v.id),
      )
      .toEqual([]);
  }
}

test("with no finding opened, the composite shows its first finding by rank with the Findings bar", async ({
  page,
}) => {
  await page.goto(report2Url("composite") + "#view=run");

  // SPEC §7.9.5: twig/twig leads the critical group.
  await expect(exampleText(page)).toHaveText(
    "The first finding by rank: twig/twig v2.16.1 scores 32, critical.",
  );
  await expect(example(page).locator(".sbar")).toBeVisible();
  await expect(example(page).locator(".sbar")).toHaveAttribute("aria-hidden", "true");
  await axeClean(page);
});

test("the link of a Why block shows that finding's score", async ({ page }) => {
  const sheet = await openDetail2(page, "B", "symfony/monolog-bridge");

  await sheet.getByRole("link", { name: "How the score works ›" }).click();

  await expect(exampleText(page)).toHaveText(
    "The finding you opened: symfony/monolog-bridge v2.6.13 scores 36, critical.",
  );
  await expect(example(page).locator(".sbar-seg")).toHaveCount(3);
});

test("a report that grades nothing says so, draws no bar, and keeps the rules' own illustrations", async ({
  page,
}) => {
  await page.goto(report2Url("pagerfanta") + "#view=run");

  await expect(example(page)).toHaveText("No package is flagged in this report.");
  await expect(example(page).locator(".sbar")).toHaveCount(0);
  await runSurface(page)
    .getByText(/^The \d+ rules$/)
    .click();
  await expect(ruleRows(page).filter({ hasText: "parts add: 16 + 16 = 32, critical" })).toHaveCount(1);
  await axeClean(page);
});
