/**
 * The open row of All packages wears the Findings row's selected treatment, drawn once on the whole
 * row. Painted per cell, the stacked row showed a grey block behind each cell with page-coloured
 * gaps between them, and the accent rule sat beside the name only. The checks read pixels, because
 * the defect is in what the row paints, not in any one cell's computed style.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createReportPage } from "./support/report";
import { decodePng, type DecodedPng } from "./support/png";
import { findingsRow } from "./support/report2/findings";
import { packagesRow } from "./support/report2/packages";

const CASE = "baselined-wallabag-2.6";
const OPEN = "symfony/http-foundation";
const HASH = `view=packages&pkg=${encodeURIComponent(OPEN)}`;

type Rgb = string;

async function rowShot(page: Page, row: Locator): Promise<DecodedPng> {
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  if (box === null) throw new Error("row has no layout box");
  return decodePng(
    await page.screenshot({
      clip: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.floor(box.width),
        height: Math.floor(box.height),
      },
    }),
  );
}

function pixel(png: DecodedPng, x: number, y: number): Rgb {
  const i = (y * png.width + x) * 4;
  return `${png.data.readUInt8(i)},${png.data.readUInt8(i + 1)},${png.data.readUInt8(i + 2)}`;
}

/** The colours along the row's top padding, its bottom padding and its right edge, clear of the
 *  accent rule and the row's bottom border: one colour where the row is painted once. */
function frameColours(png: DecodedPng): Set<Rgb> {
  const colours = new Set<Rgb>();
  for (let x = 6; x < png.width - 3; x += 1) {
    colours.add(pixel(png, x, 2));
    colours.add(pixel(png, x, png.height - 4));
  }
  for (let y = 2; y < png.height - 3; y += 1) colours.add(pixel(png, png.width - 3, y));
  return colours;
}

/** The colours down the row's first pixel column, above its bottom border: the accent rule. */
function ruleColours(png: DecodedPng): Set<Rgb> {
  const colours = new Set<Rgb>();
  for (let y = 0; y < png.height - 2; y += 1) colours.add(pixel(png, 1, y));
  return colours;
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1200, 1440]) {
    test.describe(`${width}px, ${colorScheme}`, () => {
      test.use({ viewport: { width, height: 900 }, colorScheme });

      test("the open row paints one background and one full-height accent rule", async ({ page }) => {
        const report = await createReportPage(page);
        await report.gotoReport2WithHash(CASE, HASH);
        const open = packagesRow(page, OPEN);
        await expect(open).toHaveAttribute("aria-current", "true");
        await page.mouse.move(0, 0);

        const openShot = await rowShot(page, open);
        const closedShot = await rowShot(page, packagesRow(page, "symfony/yaml"));

        const frame = frameColours(openShot);
        expect([...frame]).toHaveLength(1);
        expect(frame).not.toEqual(frameColours(closedShot));
        const rule = ruleColours(openShot);
        expect([...rule]).toHaveLength(1);
        expect(rule).not.toEqual(frame);
      });
    });
  }
}

test.describe("the open row outside a plain screen", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("forced colours outline the open row, since they drop its background and rule", async ({ page }) => {
    const report = await createReportPage(page);
    await report.gotoReport2WithHash(CASE, HASH);
    await page.emulateMedia({ forcedColors: "active" });

    const style = await packagesRow(page, OPEN).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(style).toBe("solid");
  });

  // A print medium mounts the printed document beside the screen's table, so both rows are read.
  test("paper paints no open row", async ({ page }) => {
    const report = await createReportPage(page);
    await report.gotoReport2WithHash(CASE, HASH);
    await page.emulateMedia({ media: "print" });

    const paints = await packagesRow(page, OPEN).evaluateAll((rows) =>
      rows.map((el) => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, rule: style.boxShadow };
      }),
    );
    expect(paints.length).toBeGreaterThan(0);
    for (const paint of paints) expect(paint).toEqual({ background: "rgba(0, 0, 0, 0)", rule: "none" });
  });
});

test.describe("the open row matches the Findings row", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("All packages and Findings paint the same background and accent rule", async ({ page }) => {
    const report = await createReportPage(page);
    await page.mouse.move(0, 0);
    await report.gotoReport2WithHash(CASE, HASH);
    const packages = await rowShot(page, packagesRow(page, OPEN));
    await report.gotoReport2WithHash(CASE, `view=findings&pkg=${encodeURIComponent(OPEN)}`);
    const findings = await rowShot(page, findingsRow(page, OPEN));

    expect(pixel(packages, packages.width - 3, 2)).toBe(pixel(findings, findings.width - 3, 2));
    expect(pixel(packages, 1, Math.floor(packages.height / 2))).toBe(
      pixel(findings, 1, Math.floor(findings.height / 2)),
    );
  });
});
