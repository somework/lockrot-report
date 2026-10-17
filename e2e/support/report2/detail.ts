import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { REPO_ROOT, report2Url } from "../pages";

/** The detail sheet of a report-2 page. */
export function detailSurface(page: Page): Locator {
  return page.locator('[data-surface="detail"]');
}

/** Opens a report-2 page with one package's sheet, through the `pkg=` fragment a link would carry. */
export async function openDetail2(page: Page, caseName: string, pkg: string, hash = ""): Promise<Locator> {
  await page.goto(`${report2Url(caseName)}#${hash}${hash ? "&" : ""}pkg=${encodeURIComponent(pkg)}`);
  const sheet = detailSurface(page);
  await sheet.waitFor();
  return sheet;
}

/** One case's value of a class under `goldens/en/`, such as a block golden. */
export function goldenOf(stringClass: string, caseName: string): unknown {
  const all = JSON.parse(
    readFileSync(join(REPO_ROOT, "goldens", "en", `${stringClass}.json`), "utf8"),
  ) as Record<string, unknown>;
  const value = all[caseName];
  if (value === undefined) throw new Error(`no ${stringClass} golden for ${caseName}`);
  return value;
}

/** One case's string of a class under `goldens/en/`, the page's own golden texts. */
export const golden = (stringClass: string, caseName: string): string =>
  String(goldenOf(stringClass, caseName));

/** One case's lines of a class under `goldens/en/`, such as its Why lines. */
export const goldenLines = (stringClass: string, caseName: string): string[] =>
  goldenOf(stringClass, caseName) as string[];

/** The Why block's lines a reader sees, in order. */
export function visibleWhyLines(sheet: Locator): Promise<string[]> {
  return sheet.locator(".d2-why-lines > li:visible").allTextContents();
}

/** The Security row's rungs a reader sees, in order. */
export function visibleRungs(sheet: Locator): Promise<string[]> {
  return sheet.locator(".d2-rung:visible").allTextContents();
}

/** The command lines of the copy control. */
export function commandLines(sheet: Locator): Promise<string[]> {
  return sheet.locator(".d2-copy-line").allTextContents();
}

/** The strings lockrot's PHP grammars own for one recorded case (`commands_posix`, `commands_cmd`). */
export function phpGolden(caseName: string): { commands_posix: string[]; commands_cmd: string[] } {
  const path = join(REPO_ROOT, ".lockrot", "tests", "fixtures", "contract", "goldens", `${caseName}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as { commands_posix: string[]; commands_cmd: string[] };
}
