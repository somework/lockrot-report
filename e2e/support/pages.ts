/**
 * Where the built pages live (`file://`, no baseURL) and which fixture bundle each test draws on.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
/** e2e/support -> e2e -> repo root. */
export const REPO_ROOT = join(HERE, "..", "..");

const PAGES_DIR = join(REPO_ROOT, "build/pages");

/** The `file://` URL for one fixture's built page. */
export function pageUrl(fixture: FixtureName): string {
  return fileUrl(fixture);
}

function fileUrl(page: string): string {
  return "file://" + join(PAGES_DIR, page + ".html");
}

const REPORT2_PREFIX = "report2-";

export { isCorpusSlice } from "../../scripts/report2-embed.ts";

/** The case name of every report-2 page `scripts/pages.mjs` wrote, such as `composite`,
 *  `B-offline-dagger` or `baselined-wallabag-2.6`. */
export function report2Cases(): string[] {
  return readdirSync(PAGES_DIR)
    .filter((file) => file.startsWith(REPORT2_PREFIX) && file.endsWith(".html"))
    .map((file) => file.slice(REPORT2_PREFIX.length, -".html".length))
    .sort();
}

/** The `file://` URL of one report-2 page, by case name. */
export function report2Url(caseName: string): string {
  return fileUrl(REPORT2_PREFIX + caseName);
}

/** Named as `scripts/pages.mjs` writes them, each picked for what it contains. */
export const FIXTURES = {
  /** Planted: the composite report-2 embed without its `rot_depth` key. Kept out of the page sweeps,
   *  which expect a report. */
  malformedReport2: "planted/report2-malformed",
  /** Planted: the composite with symfony/yaml renamed to `METACHAR_NAME`. */
  metacharReport2: "planted/report2-metachar",
  /** Planted: a report-1 document (`fixtures/bundles/mini.json`), which the page answers with the
   *  report-1 screen. */
  report1: "planted/report1",
} as const;
export type FixtureName = (typeof FIXTURES)[keyof typeof FIXTURES];
