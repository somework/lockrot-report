// The report-2 pages' data: lockrot's recorded bundle, fetched by `npm run contract:fetch`
// (DESIGN.md §7), assembled into the html embed `{report, details}`. lockrot records no
// per-case embed, so this module builds one. Node runs it directly; the unit tests import it too.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Details, Report2Embed } from "../src/model/report2.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURES = join(ROOT, ".lockrot", "tests", "fixtures");

export interface Report2Page {
  /** The page's file name without `.html`; `e2e/support/pages.ts` opens it by this. */
  name: string;
  embed: Report2Embed;
}

function readJson(...parts: string[]): unknown {
  const path = join(FIXTURES, ...parts);
  if (!existsSync(path)) throw new Error(`${path} is missing: run \`npm run contract:fetch\` first`);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Every report-2 document of the bundle: the detail and axe specs open single cases. */
export function report2Cases(): string[] {
  return readdirSync(join(FIXTURES, "contract", "report-2"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

/** A package name of CSS-selector metacharacters, for the planted `report2-metachar` page. */
export const METACHAR_NAME = `acme/q"u]o[te\\'<x>`;

/** The corpus slice: the composite, the offline cases and the baselined embeds (by page case name). */
export function isCorpusSlice(caseName: string): boolean {
  return caseName === "composite" || caseName.includes("offline") || caseName.startsWith("baselined-");
}

interface Explain2 {
  package: string;
  lock: Details[string]["lock"];
  metadata: Details[string]["metadata"];
}

/**
 * `details` comes from the case's explain-2 document. explain-2 has no `repository_link`, so the
 * entry says `null`: no link. A case without an explain-2 document (the composite) has no details.
 */
export function assembleEmbed(name: string): Report2Embed {
  const report = readJson("contract", "report-2", `${name}.json`) as Report2Embed["report"];
  if (!existsSync(join(FIXTURES, "contract", "explain-2", `${name}.json`))) return { report, details: {} };
  const { package: pkg, lock, metadata } = readJson("contract", "explain-2", `${name}.json`) as Explain2;
  return { report, details: { [pkg]: { lock, metadata, repository_link: null } } };
}

/** The two baselined html embeds, as lockrot recorded them. */
function baselinedPages(): Report2Page[] {
  return readdirSync(join(FIXTURES, "baselined"))
    .sort()
    .filter((scenario) => existsSync(join(FIXTURES, "baselined", scenario, "check", "report.bundle.json")))
    .map((scenario) => ({
      name: `report2-baselined-${scenario}`,
      embed: readJson("baselined", scenario, "check", "report.bundle.json") as Report2Embed,
    }));
}

export function report2Pages(): Report2Page[] {
  const assembled = report2Cases().map((name) => ({ name: `report2-${name}`, embed: assembleEmbed(name) }));
  return [...assembled, ...baselinedPages()];
}
