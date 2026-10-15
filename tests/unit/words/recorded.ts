// What lockrot recorded at the pinned commit, read the way the page reads it: a report-2 document,
// and the details of its one package (DESIGN.md §7).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import type { Finding, Report2, RepositoryMetadata, Run } from "../../../src/model/report2";

const FIXTURES = join(process.cwd(), ".lockrot", "tests", "fixtures");
const CONTRACT = join(FIXTURES, "contract");

/** The strings lockrot's PHP grammars own, one object per case (`goldens/<case>.json`). */
export interface PhpGoldens {
  age_line: string | null;
  baseline_suffix: string | null;
  commands_posix: string[];
  commands_cmd: string[];
}

/** The model's strings for one case (`flags/cases.json`), the reference of the first recording only. */
export interface ModelGoldens extends PhpGoldens {
  answer: string;
  why: string[];
  checks: string;
  branches: string | null;
  security_row: string;
}

export interface RecordedCase {
  name: string;
  report: Report2;
  finding: Finding;
  run: Run;
  metadata: RepositoryMetadata | null;
  php: PhpGoldens | null;
}

export interface ModelCase {
  id: string;
  name: string;
  run: Run;
  finding: Finding;
  metadata: RepositoryMetadata | null;
  golden: ModelGoldens;
}

export function readContractJson(...parts: string[]): unknown {
  const path = join(CONTRACT, ...parts);
  if (!existsSync(path)) throw new Error(`${path} is missing: run \`npm run contract:fetch\` first`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function caseNames(dir: string): string[] {
  return readdirSync(join(CONTRACT, dir))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

function metadataOf(name: string): RepositoryMetadata | null {
  if (!existsSync(join(CONTRACT, "explain-2", `${name}.json`))) {
    // The 15 model-only documents have no explain-2: the model's own details stand in for them.
    return modelCases().find((model) => model.name === name)?.metadata ?? null;
  }
  return (readContractJson("explain-2", `${name}.json`) as { metadata: RepositoryMetadata | null }).metadata;
}

/** The cases the hydrator cannot rebuild: the model wrote their documents, lockrot did not. */
export function modelOnlyNames(): string[] {
  return caseNames("model-only");
}

/** Every recorded document of exactly one finding, with the release branches of its package when lockrot wrote them. */
export function recordedCases(): RecordedCase[] {
  return [
    ...caseNames("report-2").map((name) => `report-2/${name}`),
    ...caseNames("model-only").map((name) => `model-only/${name}`),
  ]
    .map((path) => {
      const name = path.slice(path.indexOf("/") + 1);
      const report = readContractJson(`${path}.json`) as Report2;
      const php = existsSync(join(CONTRACT, "goldens", `${name}.json`))
        ? (readContractJson("goldens", `${name}.json`) as PhpGoldens)
        : null;
      return {
        name,
        report,
        finding: report.findings[0] as Finding,
        run: report.run,
        metadata: metadataOf(name),
        php,
      };
    })
    .filter(({ report }) => report.findings.length === 1);
}

/** The model's own inputs, each case under the name lockrot records it by. */
export function modelCases(): ModelCase[] {
  const { cases } = JSON.parse(readFileSync(join(FIXTURES, "flags", "cases.json"), "utf8")) as {
    cases: (Omit<ModelCase, "name" | "metadata"> & {
      details: { metadata: RepositoryMetadata | null } | null;
    })[];
  };
  return cases.map(({ details, ...model }) => ({
    ...model,
    name: model.id.replaceAll("‡", "-dagger"),
    metadata: details?.metadata ?? null,
  }));
}

/** Every recorded report-2 with more than one finding: the composite and the two baselined projects. */
export function multiFindingReports(): { name: string; report: Report2 }[] {
  const embeds = ["wallabag-2.6", "wallabag-main"].map((scenario) => ({
    name: `baselined/${scenario}`,
    report: (
      JSON.parse(
        readFileSync(join(FIXTURES, "baselined", scenario, "check", "report.bundle.json"), "utf8"),
      ) as { report: Report2 }
    ).report,
  }));
  return [
    { name: "composite", report: readContractJson("report-2", "composite.json") as Report2 },
    ...embeds,
  ];
}

/** One entry of `page-goldens.json`: the strings the model rendered from the root fields of `document`. */
export interface PageGolden {
  document: string;
  copy_summary: string[];
  libyears_panel: string | null;
  panel: string[] | null;
}

/** The model's report-2 of a golden's document, where lockrot's `PageGoldensTest` reads it. */
function pageGoldenDocument(document: string): Report2 {
  const name = document.slice(document.indexOf("/") + 1);
  const documents = join(FIXTURES, "schema", "documents");
  const raw = document.startsWith("cases/")
    ? readFileSync(join(documents, "cases", name), "utf8")
    : gunzipSync(readFileSync(join(documents, "corpus", `${name}.gz`))).toString("utf8");
  return JSON.parse(raw) as Report2;
}

export function pageGoldens(): { id: string; golden: PageGolden; report: Report2 }[] {
  const { goldens } = readContractJson("page-goldens.json") as { goldens: Record<string, PageGolden> };
  return Object.entries(goldens).map(([id, golden]) => ({
    id,
    golden,
    report: pageGoldenDocument(golden.document),
  }));
}
